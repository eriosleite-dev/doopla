import type { Subscription } from './supabase/types';

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
