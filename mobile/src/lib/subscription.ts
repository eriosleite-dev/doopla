import type { ArtistSubscription } from '@/types/artistProfile';

// Espelha hasDooplaPro() de src/lib/subscription.ts (painel web) —
// mesmo gate canônico de "Doopla Pro" do profissional (migration
// 0036). hasProAccess()/isArtistBlockedForBooker() (gates do lado
// Booker) não têm equivalente aqui de propósito: o Mobile só atende o
// papel artista hoje, "Plano (booker)" está fora do escopo do
// Professional Product UI (ver PROGRESS.md). Qualquer recurso do App
// condicionado a "Doopla Pro" chama esta function — nunca reimplementa
// a checagem local.
export function hasDooplaPro(subscription: ArtistSubscription | null | undefined): boolean {
  if (!subscription) return false;
  return subscription.role === 'artista' && subscription.artist_plan === 'pro' && subscription.status === 'active';
}
