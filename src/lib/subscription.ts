import type { Subscription } from './supabase/types';

// Gate canônico de "Doopla Pro" — plano público atual do profissional
// (Doopla R$29,90 / Doopla Pro R$69,90, migration 0036), independente
// de papel. Hoje só o artista tem esse plano representado
// (subscriptions.artist_plan); booker ainda não tem um equivalente —
// nunca inferido a partir de booker_plan, que é uma regra de negócio
// diferente (limite de 1 artista ativo no Básico, migration 0032) e
// deliberadamente não deve ser reaproveitado aqui (ver comentário da
// própria migration 0036). Qualquer recurso novo condicionado a
// "Doopla Pro do profissional" (ex.: e-mail de booking) consulta esta
// function — nunca hasProAccess (essa é só do booker) nem booker_plan
// direto.
//
// Definição canônica (07/09/2026, migration 0074) — trial válido conta
// como Pro: `status='active'` OU (`status='trialing'` E
// `trial_ends_at` ainda não vencido). Sem isso, ninguém em trial
// jamais teria Doopla Pro de verdade (todo artista nasce 'trialing' e
// nada no schema jamais transiciona esse status pra 'active' — não
// existe sweep/cron equivalente ao do booker). Trial vencido/canceled/
// artist_plan='doopla' são Básico. Comparação de data em UTC
// (toISOString().slice(0,10)), espelhando exatamente
// artist_has_doopla_pro() no Postgres (migration 0074) — nunca
// reimplementar essa regra inline em outro lugar (Home/Shell/
// Configurações/Minha equipe/limite de bookings/selo Pro da Comunidade
// todos consomem esta function ou a equivalente SQL).
export function hasDooplaPro(subscription: Subscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.role !== 'artista' || subscription.artist_plan !== 'pro') return false;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'trialing' && subscription.trial_ends_at) {
    const todayUTC = new Date().toISOString().slice(0, 10);
    return subscription.trial_ends_at >= todayUTC;
  }
  return false;
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
