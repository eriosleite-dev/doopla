import type { Metadata } from 'next';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';

import {
  computeArtistStats,
  computeBookerStats,
  getActivePaymentDetails,
  getArtistReceivedBookings,
  getReferralSummary,
  getUserBookings,
} from '../data';
import { ProCard, ProEmptyState, ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { PaymentDetailsCard } from './payment-details-card';
import { ProPaymentDetailsCard } from './pro-payment-details-card';

export const metadata: Metadata = {
  title: 'Financeiro | Doopla',
};

// Item 10 da revisão Professional Web Dashboard (06/09/2026) — remove
// completamente o modelo de carteira/saque pro profissional (artista):
// a Doopla não recebe o dinheiro do booking e não tem saque; no beta o
// pagamento é direto cliente -> profissional. payout_requests/
// getPayoutBalance/PayoutForm/requestPayoutAction foram DELETADOS do
// produto (confirmados sem uso em nenhuma superfície vigente antes da
// remoção) — esta página não consulta mais essa tabela, pra ninguém.
// Booker (branch abaixo) mantém a MESMA tela/lógica de sempre, só sem a
// seção de saque (que já era 100% não-funcional pra ele também: o botão
// era disabled, sem formAction — nunca existiu saque real).
export default async function DinheiroPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const bookings = await getUserBookings(user.id, profile.role, supabase);

  if (profile.role === 'booker') {
    const bookerStats = computeBookerStats(bookings);
    const paymentDetails = await getActivePaymentDetails(user.id, supabase);
    return (
      <main className="flex flex-col gap-8">
        <header>
          <p className={eyebrowClass}>Ganhos</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Ganhos</h1>
        </header>

        <section className="rounded-[18px] bg-[var(--ink)] p-6 text-[var(--paper)]">
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)]/85">Comissão recebida</p>
          <p className="font-doopla-display mt-2.5 text-[40px] font-semibold">{formatCentsAsBRL(bookerStats.totalEarnedCents)}</p>
          <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">Soma das comissões de bookings já concluídos.</p>
        </section>

        <PaymentDetailsCard key={paymentDetails?.pixKey ?? 'unset'} active={paymentDetails} />

        <section className={cardClass}>
          <p className={eyebrowClass}>Bookings ativos</p>
          <p className="mt-2 text-2xl font-semibold">{bookerStats.activeCount}</p>
        </section>
      </main>
    );
  }

  const [artistStats, referralSummary, paymentDetails] = await Promise.all([
    Promise.resolve(computeArtistStats(bookings)),
    profile.referral_code ? getReferralSummary(user.id, profile.referral_code, supabase) : Promise.resolve(null),
    getActivePaymentDetails(user.id, supabase),
  ]);

  const receivedBookings = getArtistReceivedBookings(bookings);

  return (
    <main>
      <ProPageHeader title="Financeiro" subtitle="Valores dos seus bookings e os dados que a Doopla usa pra orientar o pagamento." />

      <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none">{formatCentsAsBRL(artistStats.totalGrossCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Valor negociado (bookings confirmados)</p>
        </ProCard>
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none text-[var(--pro-green)]">{formatCentsAsBRL(artistStats.netReceivedCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Recebido líquido (bookings concluídos)</p>
        </ProCard>
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none">{formatCentsAsBRL(artistStats.monthNetReceivedCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Recebido este mês</p>
        </ProCard>
      </div>

      <ProPaymentDetailsCard active={paymentDetails} />

      <div className="mt-4">
        <ProCard>
          <p className="font-pro-sub mb-3 text-[13.5px] font-bold">Recebimentos</p>
          {receivedBookings.length === 0 ? (
            <ProEmptyState message="Nenhum recebimento ainda." />
          ) : (
            <ul className="flex flex-col gap-2">
              {receivedBookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 border-t border-[var(--pro-line)] py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--pro-off)]">{b.otherPartyName}</p>
                    <p className="text-[11.5px] text-[var(--pro-tx-50)]">{formatRelativeDate(b.receivedAtIso)}</p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-0.5">
                    <span className="font-doopla-mono text-[12.5px] font-bold text-[var(--pro-green)]">{formatCentsAsBRL(b.netCents)}</span>
                    {b.commissionCents > 0 && (
                      <span className="text-[10.5px] text-[var(--pro-tx-30)]">
                        {formatCentsAsBRL(b.grossCents)} − comissão {formatCentsAsBRL(b.commissionCents)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ProCard>
      </div>

      {referralSummary && referralSummary.referrals.length > 0 && (
        <div className="mt-4">
          <ProCard>
            <p className="font-pro-sub text-[13.5px] font-bold">Créditos de indicação</p>
            <p className="mt-1 text-[11.5px] text-[var(--pro-tx-50)]">
              Cada indicação só vira crédito depois de validada — nunca no clique do link ou no cadastro.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {referralSummary.referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-t border-[var(--pro-line)] py-2.5 first:border-t-0">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--pro-off)]">{r.referredName}</p>
                    <p className="text-[11.5px] text-[var(--pro-tx-50)]">
                      {formatCentsAsBRL(r.bonus_cents)} · {formatRelativeDate(r.created_at)}
                    </p>
                  </div>
                  <span
                    className={`font-doopla-mono rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.03em] ${
                      r.status === 'qualificada'
                        ? 'bg-[rgba(62,207,110,.15)] text-[var(--pro-green)]'
                        : r.status === 'invalida'
                          ? 'bg-[rgba(226,41,28,.15)] text-[var(--pro-red)]'
                          : 'bg-[rgba(245,166,35,.15)] text-[var(--pro-amber)]'
                    }`}
                  >
                    {r.status === 'qualificada' && 'Qualificado ✓'}
                    {r.status === 'pendente' && 'Em análise'}
                    {r.status === 'invalida' && 'Inválido'}
                  </span>
                </li>
              ))}
            </ul>
          </ProCard>
        </div>
      )}
    </main>
  );
}
