import type { Metadata } from 'next';
import Link from 'next/link';

import { getMyOpportunities, getPendingReviewsToWrite, getUserBookings } from '../data';
import { JobPicker } from '../job-picker';
import { getCachedActionableDecisions, getCachedConversationOperationalFacts } from '../pro-home-cache';
import { ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { buildWorkItems } from '../work-items';
import { ProWorkListView } from './pro-work-list-view';
import { TrabalhosList } from './trabalhos-list';

export const metadata: Metadata = {
  title: 'Bookings | Doopla',
};

// Bookings é uma rota COMPARTILHADA entre Booker (shell legado,
// intocado) e o profissional/artista (novo Shell dark) — o branch
// abaixo é o mesmo padrão já usado em dashboard/page.tsx e layout.tsx
// pra Home/Shell (ProfessionalHomeView vs BookerHomeView), nunca uma
// mudança de comportamento do Booker.
export default async function TrabalhosPage() {
  const { supabase, user, profile } = await getSessionProfile();

  if (profile.role === 'booker') {
    const [bookings, pendingReviews] = await Promise.all([
      getUserBookings(user.id, profile.role, supabase),
      getPendingReviewsToWrite(user.id, supabase),
    ]);
    const pendingReviewBookingIds = new Set(pendingReviews.map((r) => r.booking_id));

    return (
      <main className="flex flex-col gap-8">
        <div>
          <Link
            href="/dashboard"
            className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
          >
            ← Voltar pro painel
          </Link>
        </div>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={eyebrowClass}>Meus trabalhos</p>
            <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Seus trabalhos</h1>
          </div>
          <JobPicker align="down" />
        </header>
        <TrabalhosList bookings={bookings} role={profile.role} pendingReviewBookingIds={pendingReviewBookingIds} />
      </main>
    );
  }

  // Bookings unificado (correção 15/09/2026, achado da fundadora) —
  // "Bookings" passa a ser a superfície única dos trabalhos, qualquer
  // que seja o canal de entrada. `buildWorkItems` (work-items.ts) junta
  // bookings de verdade com pedidos recebidos pelo link ainda não
  // convertidos (opportunities.source='artist_link') numa lista só,
  // ordenada por urgência+relevância temporal. A antiga rota/nav
  // "Pedidos" saiu do shell (ver pro-shell.tsx) — o pedido individual
  // continua existindo como registro e como destino de detalhe
  // (/dashboard/oportunidades/[id]), só não é mais uma área separada.
  const [bookings, pedidos, conversationFacts, decisions, pendingReviews] = await Promise.all([
    getUserBookings(user.id, profile.role, supabase),
    getMyOpportunities(user.id, supabase),
    getCachedConversationOperationalFacts(supabase),
    getCachedActionableDecisions(supabase),
    getPendingReviewsToWrite(user.id, supabase),
  ]);
  const pedidosRecebidos = pedidos.filter((o) => o.source === 'artist_link');
  const items = buildWorkItems({
    bookings,
    pedidos: pedidosRecebidos,
    userId: user.id,
    conversationFacts,
    decisions,
    pendingReviewBookingIds: pendingReviews.map((r) => r.booking_id),
  });

  return (
    <main>
      <ProPageHeader title="Bookings" subtitle="Todos os seus trabalhos, do primeiro contato até a conclusão." />
      <ProWorkListView items={items} />
    </main>
  );
}
