import type { Subscription } from './supabase/types';

// Gate canônico de "Doopla Pro" — plano público atual do profissional
// (Doopla R$29,90 / Doopla Pro R$59,90, migration 0036), independente
// de papel. Hoje só o artista tem esse plano representado
// (subscriptions.artist_plan); booker ainda não tem um equivalente —
// nunca inferido a partir de booker_plan, que é uma regra de negócio
// diferente (limite de 1 artista ativo no Básico, migration 0032) e
// deliberadamente não deve ser reaproveitado aqui (ver comentário da
// própria migration 0036). Qualquer recurso novo condicionado a
// "Doopla Pro do profissional" (ex.: e-mail de booking) consulta esta
// function — nunca hasProAccess (essa é só do booker) nem booker_plan
// direto.
export function hasDooplaPro(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false;
  return subscription.role === 'artista' && subscription.artist_plan === 'pro' && subscription.status === 'active';
}

// Gate de permissão central pro plano do Booker. Qualquer recurso
// futuro marcado como Pro-only chama isso — nunca reimplementa a
// checagem. Consulta sempre o estado REAL (plano + assinatura ativa),
// nunca "já foi Pro alguma vez".
export function hasProAccess(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false;
  return (
    subscription.role === 'booker' &&
    subscription.booker_plan === 'pro' &&
    subscription.status === 'active'
  );
}

// True quando o booker está no Básico e já tem um artista ativo
// diferente do informado — bloqueia operações NOVAS pra esse artista
// (bookings em andamento não são afetados, só criação de operação
// nova). Sem restrição pro Pro nem pra quem ainda não tem artista
// ativo definido.
export function isArtistBlockedForBooker(
  subscription: Subscription | null | undefined,
  artistProfileId: string
): boolean {
  if (!subscription || subscription.role !== 'booker') return false;
  if (hasProAccess(subscription)) return false;
  if (!subscription.active_artist_profile_id) return false;
  return subscription.active_artist_profile_id !== artistProfileId;
}
