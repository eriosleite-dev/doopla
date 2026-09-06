import type { Metadata } from 'next';
import Link from 'next/link';

import { listConversationOperationalFacts, mapConversationIdsByBookingId } from '@/lib/conversations/data';

import { getPendingReviewsToWrite, getUserBookings } from '../data';
import { JobPicker } from '../job-picker';
import { ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { ProTrabalhosView } from './pro-trabalhos-view';
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

  const [bookings, conversationFacts, pendingReviews] = await Promise.all([
    getUserBookings(user.id, profile.role, supabase),
    listConversationOperationalFacts(supabase),
    getPendingReviewsToWrite(user.id, supabase),
  ]);
  const conversationIdByBookingId = mapConversationIdsByBookingId(conversationFacts);
  const pendingReviewBookingIds = pendingReviews.map((r) => r.booking_id);

  return (
    <main>
      <ProPageHeader title="Bookings" subtitle="Todos os seus bookings, negociados pela Doopla ou por você." />
      <ProTrabalhosView
        bookings={bookings}
        role={profile.role}
        conversationIdByBookingId={conversationIdByBookingId}
        pendingReviewBookingIds={pendingReviewBookingIds}
      />
    </main>
  );
}
