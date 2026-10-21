import type { ArtistSubscription } from '@/types/artistProfile';

// Espelha hasDooplaPro() de src/lib/subscription.ts (painel web) —
// mesmo gate canônico de "Doopla Pro" do profissional (migration
// 0036). hasProAccess()/isArtistBlockedForBooker() (gates do lado
// Booker) não têm equivalente aqui de propósito: o Mobile só atende o
// papel artista hoje, "Plano (booker)" está fora do escopo do
// Professional Product UI (ver PROGRESS.md). Qualquer recurso do App
// condicionado a "Doopla Pro" chama esta function — nunca reimplementa
// a checagem local.
//
// Definição canônica (07/09/2026, migration 0074) — trial válido conta
// como Pro, espelhando exatamente o Web e artist_has_doopla_pro() no
// Postgres. Ver comentário completo em src/lib/subscription.ts (Web).
export function hasDooplaPro(subscription: ArtistSubscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.role !== 'artista' || subscription.artist_plan !== 'pro') return false;
  if (subscription.status === 'active') return true;
  if (subscription.status === 'trialing' && subscription.trial_ends_at) {
    const todayUTC = new Date().toISOString().slice(0, 10);
    return subscription.trial_ends_at >= todayUTC;
  }
  return false;
}
