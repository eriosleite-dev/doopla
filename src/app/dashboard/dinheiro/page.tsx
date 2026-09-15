import type { Metadata } from 'next';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';

import {
  computeArtistStats,
  computeBookerStats,
  getActivePaymentDetails,
  getReferralSummary,
  getUserBookings,
} from '../data';
import { ProCard, ProPageHeader } from '../pro-ui';
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
//
// Auditoria de Financeiro (15/09/2026) — labels do lado artista
// reescritos pra nunca implicar que a Doopla processou/confirmou um
// pagamento: os únicos 2 caminhos que levam bookings a 'concluida'
// (markPaidAction, booker; advanceInvoiceStage, artista via NF) são
// auto-reportados, nunca uma confirmação de terceiro/gateway — ver
// comentário em computeArtistStats (../data.ts). "Recebido
// líquido"/"Recebido este mês"/"Recebimentos" viraram "Valor em
// bookings concluídos"/"Valor concluído este mês"/"Bookings
// concluídos" — mesmos cálculos, só copy semanticamente fiel ao que o
// dado representa (valor de bookings, não pagamento verificado). Esta
// página também passou a ser a ÚNICA superfície canônica de "Dados de
// recebimento" (a linha equivalente em Configurações → Assinatura e
// cobrança foi removida, ver pro-configuracoes-view.tsx — mesmo
// PaymentDetailsFields/RPC, nenhuma duplicação de lógica, só de
// navegação).
//
// QA visual (15/09/2026) — removida a lista "Bookings concluídos" que
// existia abaixo de "Dados de recebimento": era uma segunda listagem de
// bookings dentro de Financeiro, sobrepondo o que a página Bookings já
// cobre. Financeiro (App, mobile/app/(tabs)/mais/financeiro.tsx) nunca
// teve essa lista — só os 3 stats de valor —, então a remoção também
// alinha Web à arquitetura compartilhada já usada no App. Nenhum dado
// novo foi criado nem removido do modelo: os 3 cards de valor acima
// (que já eram os únicos números "financeiros" de verdade da página)
// continuam intactos, sem mudança de cálculo ou de copy.
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

  return (
    <main>
      <ProPageHeader title="Financeiro" subtitle="Valores dos seus bookings e os dados que a Doopla usa pra orientar o pagamento." />

      <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none">{formatCentsAsBRL(artistStats.totalGrossCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Valor em bookings confirmados</p>
        </ProCard>
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none text-[var(--pro-green)]">{formatCentsAsBRL(artistStats.netReceivedCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Valor em bookings concluídos</p>
        </ProCard>
        <ProCard>
          <p className="font-pro-display text-[22px] leading-none">{formatCentsAsBRL(artistStats.monthNetReceivedCents)}</p>
          <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">Valor concluído este mês</p>
        </ProCard>
      </div>

      <ProPaymentDetailsCard active={paymentDetails} />

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
