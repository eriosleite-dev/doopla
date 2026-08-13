import type { Metadata } from 'next';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';

import {
  computeArtistStats,
  computeBookerStats,
  getPayoutBalance,
  getUserBookings,
} from '../data';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { PayoutForm } from './payout-form';

export const metadata: Metadata = {
  title: 'Dinheiro | Doopla',
};

export default async function DinheiroPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const bookings = await getUserBookings(user.id, profile.role, supabase);

  const totalReceivedCents =
    profile.role === 'booker'
      ? computeBookerStats(bookings).totalEarnedCents
      : computeArtistStats(bookings).netReceivedCents;

  const { availableCents, requests } = await getPayoutBalance(
    user.id,
    totalReceivedCents,
    supabase
  );

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Dinheiro</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          {profile.role === 'booker' ? 'Meus ganhos' : 'Dinheiro'}
        </h1>
      </header>

      <section className="rounded-[18px] bg-[var(--ink)] p-6 text-[var(--paper)]">
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)]/85">
          Disponível para saque
        </p>
        <p className="font-doopla-display mt-2.5 text-[40px] font-semibold">
          {formatCentsAsBRL(availableCents)}
        </p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          {profile.role === 'booker'
            ? 'Comissão já recebida, descontado o que já foi solicitado'
            : 'Recebido líquido, descontado o que já foi solicitado'}
        </p>
        <div className="mt-5">
          <PayoutForm availableCents={availableCents} />
        </div>
        <p className="mt-3 text-[11px] text-[var(--paper)]/45">
          A transferência de verdade ainda não está disponível — isso só registra seu pedido.
        </p>
      </section>

      <section className={cardClass}>
        <p className={eyebrowClass}>Solicitações de saque</p>
        {requests.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink)]/55">Nenhuma solicitação ainda.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between border-t border-[var(--line-light)] py-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-sm font-medium">{formatCentsAsBRL(r.amount_cents)}</p>
                  <p className="text-[12px] text-[var(--ink)]/55">
                    {formatRelativeDate(r.created_at)}
                  </p>
                </div>
                <span className="font-doopla-mono rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
                  Solicitado
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
