import type { Metadata } from 'next';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';

import {
  computeArtistStats,
  computeBookerStats,
  getPayoutBalance,
  getReferralSummary,
  getUserBookings,
} from '../data';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { PaymentDetailsCard } from './payment-details-card';
import { PayoutForm } from './payout-form';
import type { PaymentDetails } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Pagamentos | Doopla',
};

export default async function DinheiroPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const bookings = await getUserBookings(user.id, profile.role, supabase);

  const referralSummary =
    profile.role === 'artista'
      ? await getReferralSummary(user.id, profile.referral_code, supabase)
      : null;

  const totalReceivedCents =
    profile.role === 'booker'
      ? computeBookerStats(bookings).totalEarnedCents
      : computeArtistStats(bookings).netReceivedCents + (referralSummary?.qualifiedTotalCents ?? 0);

  const { availableCents, requests } = await getPayoutBalance(
    user.id,
    totalReceivedCents,
    supabase
  );

  const { data: activePaymentDetails } = await supabase
    .from('payment_details')
    .select('id, pix_key_type, pix_key, holder_name')
    .eq('profile_id', user.id)
    .eq('status', 'active')
    .maybeSingle<Pick<PaymentDetails, 'id' | 'pix_key_type' | 'pix_key' | 'holder_name'>>();

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>{profile.role === 'booker' ? 'Ganhos' : 'Pagamentos'}</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          {profile.role === 'booker' ? 'Ganhos' : 'Pagamentos'}
        </h1>
      </header>

      <section className="rounded-[18px] bg-[var(--ink)] p-6 text-[var(--paper)]">
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)]/85">
          A receber / disponível
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
          <PayoutForm />
        </div>
      </section>

      <PaymentDetailsCard
        key={activePaymentDetails?.id ?? 'unset'}
        active={
          activePaymentDetails?.pix_key_type && activePaymentDetails.pix_key
            ? {
                pixKeyType: activePaymentDetails.pix_key_type,
                pixKey: activePaymentDetails.pix_key,
                holderName: activePaymentDetails.holder_name,
              }
            : null
        }
      />

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

      {referralSummary && referralSummary.referrals.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Créditos de indicação</p>
          <p className="mt-1 text-[12px] text-[var(--ink)]/50">
            Cada indicação só vira crédito depois de validada — nunca no clique do link ou no
            cadastro.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {referralSummary.referrals.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between border-t border-[var(--line-light)] py-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-sm font-medium">{r.referredName}</p>
                  <p className="text-[12px] text-[var(--ink)]/55">
                    {formatCentsAsBRL(r.bonus_cents)} · {formatRelativeDate(r.created_at)}
                  </p>
                </div>
                <span
                  className={`font-doopla-mono rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.03em] ${
                    r.status === 'qualificada'
                      ? 'bg-[var(--musgo)]/10 text-[var(--musgo)]'
                      : r.status === 'invalida'
                        ? 'bg-[var(--alert)]/10 text-[var(--alert)]'
                        : 'bg-[var(--accent)]/15 text-[var(--accent-ink)]'
                  }`}
                >
                  {r.status === 'qualificada' && 'Qualificado ✓'}
                  {r.status === 'pendente' && 'Em análise'}
                  {r.status === 'invalida' && 'Inválido'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
