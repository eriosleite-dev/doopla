import Link from 'next/link';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';
import type { ConversationOperationalFacts } from '@/lib/conversations/data';
import type { Checkpoint } from '../../data';

import {
  markCompletedAction,
  markDisputeAction,
  markInCollectionAction,
  markInvoiceClientPaidAction,
  markInvoiceCommissionPaidAction,
  markInvoiceIssuedAction,
  markInvoiceSentAction,
  markPaidAction,
  respondBookingAction,
} from '../../actions';
import type { BookingWithOtherParty } from '../../data';
import { CONVERSATION_STATE_LABELS, STATUS_LABELS } from '../../ui';
import { ProCard, ProPageHeader } from '../../pro-ui';
import { bookingStatusTone, PRO_CONVERSATION_STATE_TONE, proGhostButtonClass, proPrimaryButtonClass, proStatusPillClass } from '../../pro-format';
import { DISPUTE_LABELS, PAYMENT_DUE_LABELS, invoiceStages, paymentDueState, paymentPolicySummary } from './booking-detail-shared';
import { ProCancelBookingForm } from './pro-cancel-booking-form';
import { ProContractSection } from './pro-contract-section';
import { ProCounterForm } from './pro-counter-form';
import { ProInvoiceTermForm } from './pro-invoice-term-form';
import { ProRescheduleForm } from './pro-reschedule-form';
import { ProReviewPanel } from './pro-review-panel';

function conversationStatePill(state: string): string {
  return proStatusPillClass(PRO_CONVERSATION_STATE_TONE[state] ?? 'neutral');
}

function proCpDotClass(done: boolean): string {
  return `mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full font-doopla-mono text-[11px] ${
    done ? 'bg-[var(--pro-green)] text-[var(--pro-black)]' : 'bg-[var(--pro-red)] text-[var(--pro-off)]'
  }`;
}

function proCpLabelClass(done: boolean): string {
  return `font-doopla-mono mt-1.5 text-[9.5px] uppercase tracking-[.02em] ${
    done ? 'text-[var(--pro-tx-45)]' : 'font-semibold text-[var(--pro-red)]'
  }`;
}

const PRO_PAYMENT_DUE_TONE: Record<'a_vencer' | 'vencido' | 'em_cobranca', 'amber' | 'red'> = {
  a_vencer: 'amber',
  vencido: 'red',
  em_cobranca: 'red',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Artista/agência — tema --pro-* (Bloco 7, P1, 08/09/2026). Mesma
// estrutura/lógica/estados do LegacyBookingDetailView (Booker),
// composição revisada pro sistema visual atual (ProCard, pills,
// botões vermelho-único, checkpoints em verde/vermelho) — nunca uma
// segunda implementação de regra de negócio, só apresentação. Ver
// legacy-booking-detail-view.tsx pra comparação lado a lado de cada
// branch de status/role.
export function ProBookingDetailView({
  booking,
  events,
  isProposer,
  checkpoints,
  hasActiveCheckpoints,
  reviews,
  conversationId,
  conversationFacts,
  role,
  userId,
}: {
  booking: BookingWithOtherParty;
  events: { id: string; event_type: string; commission_percent: number | null; created_at: string }[];
  isProposer: boolean;
  checkpoints: Checkpoint[];
  hasActiveCheckpoints: boolean;
  reviews: { myReview: import('@/lib/supabase/types').Review | null; reviewOfMe: import('@/lib/supabase/types').Review | null } | null;
  conversationId: string | null;
  conversationFacts: ConversationOperationalFacts | null;
  role: 'artista' | 'booker' | 'agencia';
  userId: string;
}) {
  const EVENT_LABELS: Record<string, string> = {
    proposta_enviada: 'Proposta enviada',
    contraproposta: 'Contraproposta',
    aceita: 'Proposta aceita',
    recusada: 'Proposta recusada',
    aguardando_pagamento: 'Marcado como realizado',
    pagamento_confirmado: 'Pagamento confirmado',
    concluida: 'Booking concluído',
    cancelada: 'Booking cancelado',
    remarcacao_proposta: 'Remarcação proposta',
    remarcacao_aceita: 'Remarcação aceita',
    remarcacao_recusada: 'Remarcação recusada',
    em_cobranca: 'Marcado como em cobrança',
    disputa_aberta: 'Disputa aberta',
    chargeback_aberto: 'Chargeback aberto',
    nf_prazo_atualizado: 'Prazo de pagamento da NF atualizado',
    nf_emitida: 'NF marcada como emitida',
    nf_enviada_cliente: 'NF marcada como enviada ao cliente',
    nf_pagamento_recebido: 'Pagamento do cliente confirmado pelo artista',
    nf_comissao_paga: 'Comissão do Booker marcada como paga',
  };

  return (
    <main className="flex flex-col gap-4">
      <div>
        <Link href="/dashboard" className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]">
          ← Voltar pro painel
        </Link>
      </div>

      <ProPageHeader
        title={booking.otherPartyName}
        subtitle="Negociação"
        action={<span className={proStatusPillClass(bookingStatusTone(booking, userId))}>{STATUS_LABELS[booking.status]}</span>}
        badge={
          <span className="font-pro-sub flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/10 text-[13px] font-bold text-[var(--pro-off)]">
            {initials(booking.otherPartyName)}
          </span>
        }
      />

      {conversationId && conversationFacts && (
        <ProCard className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Conversa com {booking.otherPartyName}</p>
            <p className="mt-1 text-sm text-[var(--pro-tx-70)]">
              {conversationFacts.lastMessageCreatedAt
                ? `Última mensagem ${formatRelativeDate(conversationFacts.lastMessageCreatedAt)}`
                : 'Nenhuma mensagem ainda'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={conversationStatePill(conversationFacts.state)}>{CONVERSATION_STATE_LABELS[conversationFacts.state]}</span>
            <Link href={`/dashboard/bookings/${booking.id}/conversa/${conversationId}`} className={proGhostButtonClass}>
              Ver conversa
            </Link>
          </div>
        </ProCard>
      )}

      <ProCard>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Comissão proposta</dt>
            <dd className="font-pro-display mt-1 text-2xl">{formatPercent(booking.commission_percent)}</dd>
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Cachê</dt>
            <dd className="font-pro-display mt-1 text-2xl">
              {booking.cache_amount_cents != null ? formatCentsAsBRL(booking.cache_amount_cents) : 'Ainda não fechado'}
            </dd>
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Data do trabalho</dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--pro-off)]">
              {booking.event_date ? new Date(`${booking.event_date}T00:00:00`).toLocaleDateString('pt-BR') : 'A confirmar'}
            </dd>
            {booking.original_event_date && booking.original_event_date !== booking.event_date && (
              <dd className="mt-1 text-[11.5px] text-[var(--pro-tx-30)]">
                Remarcado — era {new Date(`${booking.original_event_date}T00:00:00`).toLocaleDateString('pt-BR')}
              </dd>
            )}
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Última atualização</dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--pro-off)]">{formatRelativeDate(booking.updated_at)}</dd>
          </div>
        </dl>
        {booking.description && (
          <p className="mt-6 border-t border-[var(--pro-line)] pt-6 text-sm text-[var(--pro-tx-70)]">{booking.description}</p>
        )}
      </ProCard>

      {booking.requires_invoice === 'sim' && (
        <ProCard>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-doopla-mono inline-block rounded-full bg-[var(--pro-red)]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-[.05em] text-[var(--pro-red)]">
              Nota fiscal necessária
            </span>
            <span className="text-[13px] text-[var(--pro-tx-50)]">Pagamento direto ao artista</span>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Prazo de pagamento</dt>
              <dd className="mt-1 text-sm text-[var(--pro-off)]">{booking.invoice_payment_term ?? 'A confirmar'}</dd>
            </div>
            <div>
              <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Pagamento da comissão</dt>
              <dd className="mt-1 text-sm text-[var(--pro-off)]">Pelo artista, após o recebimento do cliente</dd>
            </div>
          </dl>

          {role === 'booker' && !['recusada', 'cancelada'].includes(booking.status) && (
            <div className="mt-3">
              <ProInvoiceTermForm bookingId={booking.id} currentTerm={booking.invoice_payment_term} />
            </div>
          )}

          <div className="mt-4 rounded-[12px] bg-[var(--pro-red)]/5 p-3.5 text-[12.5px] leading-relaxed text-[var(--pro-tx-70)]">
            <p className="font-medium text-[var(--pro-off)]">Pagamento externo</p>
            <p className="mt-1">
              Este trabalho será faturado diretamente pelo artista ao contratante e não terá o
              pagamento processado pela Doopla. As proteções de pagamento da Doopla não se aplicam
              ao valor pago diretamente entre as partes.
            </p>
          </div>

          {booking.status !== 'proposta_enviada' && booking.status !== 'recusada' && (
            <div className="mt-5 border-t border-[var(--pro-line)] pt-4">
              <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Acompanhamento do faturamento</p>
              <div className="mt-3 flex gap-2">
                {invoiceStages(booking).map((s) => (
                  <div key={s.key} className="flex-1 text-center">
                    <div className={proCpDotClass(s.done)}>{s.done ? '✓' : '!'}</div>
                    <p className={proCpLabelClass(s.done)}>{s.label}</p>
                  </div>
                ))}
              </div>

              {role === 'artista' && booking.status !== 'cancelada' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!booking.invoice_issued_at && (
                    <form action={markInvoiceIssuedAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={proGhostButtonClass}>
                        Marcar NF como emitida
                      </button>
                    </form>
                  )}
                  {booking.invoice_issued_at && !booking.invoice_sent_to_client_at && (
                    <form action={markInvoiceSentAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={proGhostButtonClass}>
                        Marcar como enviada ao cliente
                      </button>
                    </form>
                  )}
                  {booking.invoice_sent_to_client_at && !booking.invoice_client_paid_at && (
                    <form action={markInvoiceClientPaidAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={proPrimaryButtonClass}>
                        Marcar pagamento recebido do cliente
                      </button>
                    </form>
                  )}
                  {booking.invoice_client_paid_at && !booking.invoice_commission_paid_at && (
                    <form action={markInvoiceCommissionPaidAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={proPrimaryButtonClass}>
                        Marcar comissão como paga
                      </button>
                    </form>
                  )}
                </div>
              )}

              {booking.invoice_client_paid_at && !booking.invoice_commission_paid_at && booking.cache_amount_cents != null && (
                <p className="mt-3 text-sm text-[var(--pro-tx-70)]">
                  Comissão pendente:{' '}
                  {formatCentsAsBRL(Math.round((booking.cache_amount_cents * booking.commission_percent) / 100))}
                </p>
              )}
            </div>
          )}
        </ProCard>
      )}

      {hasActiveCheckpoints && (
        <ProCard>
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Checkpoints</p>
          <div className="mt-4 flex gap-2">
            {checkpoints.map((cp) => (
              <div key={cp.key} className="flex-1 text-center">
                <div className={proCpDotClass(cp.done)}>{cp.done ? '✓' : '!'}</div>
                <p className={proCpLabelClass(cp.done)}>{cp.label}</p>
              </div>
            ))}
          </div>
        </ProCard>
      )}

      <ProCard>
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">O que fazer agora</p>

        {booking.status === 'proposta_enviada' && !isProposer && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--pro-tx-70)]">
              {booking.otherPartyName} propôs {formatPercent(booking.commission_percent)} de comissão. Aceite, recuse ou envie uma contraproposta.
            </p>

            <div className="rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4 text-[12.5px] text-[var(--pro-tx-70)]">
              <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Condições de cancelamento</p>
              <ul className="mt-2 flex flex-col gap-1">
                {paymentPolicySummary(booking).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <form action={respondBookingAction} className="flex flex-col gap-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="decision" value="aceitar" />
              <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--pro-tx-70)]">
                <input type="checkbox" name="cancellationAccepted" required className="mt-0.5 h-4 w-4" />
                Li e aceito as condições de cancelamento acima.
              </label>
              {booking.requires_invoice === 'sim' && (
                <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--pro-tx-70)]">
                  <input type="checkbox" name="invoiceTermsAccepted" required className="mt-0.5 h-4 w-4" />
                  Estou ciente de que este trabalho exige Nota Fiscal, que o pagamento será feito
                  diretamente ao artista e que minha comissão será paga pelo artista após o
                  recebimento do cliente.
                </label>
              )}
              <button type="submit" className={`${proPrimaryButtonClass} self-start`}>
                Aceitar proposta
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <ProCounterForm bookingId={booking.id} />
              <form action={respondBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="recusar" />
                <button type="submit" className={proGhostButtonClass}>
                  Recusar
                </button>
              </form>
            </div>
          </div>
        )}

        {booking.status === 'proposta_enviada' && isProposer && (
          <p className="mt-4 text-sm text-[var(--pro-tx-70)]">
            Sua proposta foi enviada. Aguardando resposta de {booking.otherPartyName}.
          </p>
        )}

        {booking.status === 'aceita' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--pro-tx-70)]">
              Proposta aceita. Quando o trabalho acontecer, marque como realizado pra liberar o pagamento.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <form action={markCompletedAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <label className="flex flex-col gap-1.5">
                  <span className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Vencimento do pagamento (opcional)</span>
                  <input
                    type="date"
                    name="paymentDueAt"
                    className="rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--pro-off)] outline-none focus:border-[var(--pro-tx-30)]"
                  />
                </label>
                <button type="submit" className={proPrimaryButtonClass}>
                  Marcar como realizado
                </button>
              </form>
              <ProRescheduleForm
                bookingId={booking.id}
                role={role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={userId === booking.reschedule_proposed_by}
              />
              {role === 'artista' && <ProCancelBookingForm bookingId={booking.id} policyLines={paymentPolicySummary(booking)} />}
            </div>
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && role === 'booker' && booking.requires_invoice === 'sim' && (
          <p className="mt-4 text-sm text-[var(--pro-tx-70)]">
            Trabalho realizado. Este é um trabalho com Nota Fiscal — acompanhe o faturamento e a comissão pendente na seção acima.
          </p>
        )}

        {booking.status === 'aguardando_pagamento' && role === 'booker' && booking.requires_invoice !== 'sim' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--pro-tx-70)]">Trabalho realizado. Quando o cliente pagar, marque o booking como concluído.</p>

            {(() => {
              const dueState = paymentDueState(booking);
              if (!dueState) return null;
              return (
                <div className="flex items-center gap-3">
                  <span className={proStatusPillClass(PRO_PAYMENT_DUE_TONE[dueState])}>{PAYMENT_DUE_LABELS[dueState]}</span>
                  {dueState === 'vencido' && (
                    <form action={markInCollectionAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={proGhostButtonClass}>
                        Marcar em cobrança
                      </button>
                    </form>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center gap-3">
              <form action={markPaidAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <button type="submit" className={proPrimaryButtonClass}>
                  Marcar como pago
                </button>
              </form>
              <ProRescheduleForm
                bookingId={booking.id}
                role={role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={userId === booking.reschedule_proposed_by}
              />
            </div>

            {booking.dispute_status === 'nenhuma' ? (
              <details className="group">
                <summary className="font-doopla-mono cursor-pointer select-none list-none text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-45)] hover:text-[var(--pro-off)]">
                  Problema com o pagamento? Marcar disputa/chargeback
                </summary>
                <form action={markDisputeAction} className="mt-3 flex flex-wrap items-center gap-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <select
                    name="disputeStatus"
                    defaultValue="em_disputa"
                    className="rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-2 text-sm text-[var(--pro-off)] outline-none focus:border-[var(--pro-tx-30)]"
                  >
                    <option value="em_disputa">Cliente abriu disputa</option>
                    <option value="chargeback">Chargeback no cartão</option>
                  </select>
                  <button type="submit" className={proGhostButtonClass}>
                    Registrar
                  </button>
                </form>
              </details>
            ) : (
              <p className="text-sm text-[#ff8b80]">
                {DISPUTE_LABELS[booking.dispute_status]}
                {booking.dispute_opened_at && ` — ${formatRelativeDate(booking.dispute_opened_at)}`}.
                Sempre separado de cancelamento; execução financeira ainda depende do contrato de credenciamento.
              </p>
            )}
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && role === 'artista' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--pro-tx-70)]">
              {booking.requires_invoice === 'sim'
                ? 'Trabalho realizado. Este é um trabalho com Nota Fiscal — marque as etapas do faturamento na seção acima.'
                : `Trabalho realizado. Aguardando confirmação de pagamento por ${booking.otherPartyName}.`}
            </p>
            {booking.requires_invoice !== 'sim' &&
              (() => {
                const dueState = paymentDueState(booking);
                if (!dueState) return null;
                return <span className={`w-fit ${proStatusPillClass(PRO_PAYMENT_DUE_TONE[dueState])}`}>{PAYMENT_DUE_LABELS[dueState]}</span>;
              })()}
            {booking.requires_invoice !== 'sim' && booking.dispute_status !== 'nenhuma' && (
              <p className="text-sm text-[#ff8b80]">
                {DISPUTE_LABELS[booking.dispute_status]}
                {booking.dispute_opened_at && ` — ${formatRelativeDate(booking.dispute_opened_at)}`}.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ProRescheduleForm
                bookingId={booking.id}
                role={role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={userId === booking.reschedule_proposed_by}
              />
              <ProCancelBookingForm bookingId={booking.id} policyLines={paymentPolicySummary(booking)} />
            </div>
          </div>
        )}

        {booking.status === 'recusada' && <p className="mt-4 text-sm text-[var(--pro-tx-70)]">Essa proposta foi recusada.</p>}

        {booking.status === 'concluida' && <p className="mt-4 text-sm text-[var(--pro-tx-70)]">Booking concluído. Nada pendente por aqui.</p>}

        {booking.status === 'cancelada' && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-[var(--pro-tx-70)]">
              Cancelado {booking.cancelled_at ? formatRelativeDate(booking.cancelled_at) : ''}
              {booking.cancellation_initiator === 'cliente' ? ' — o cliente desistiu.' : ' — pelo artista.'}
              {booking.cancellation_reason && ` Motivo: ${booking.cancellation_reason}`}
            </p>
            <div className="rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4 text-[12.5px] text-[var(--pro-tx-70)]">
              <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">O que a política dizia</p>
              <ul className="mt-2 flex flex-col gap-1">
                {paymentPolicySummary(booking).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-[var(--pro-tx-30)]">Execução de eventual reembolso ainda depende da integração real de pagamento.</p>
            </div>
          </div>
        )}
      </ProCard>

      {hasActiveCheckpoints && (
        <ProCard>
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Contrato</p>
          <div className="mt-4">
            <ProContractSection booking={booking} />
          </div>
        </ProCard>
      )}

      {reviews && (
        <ProCard id="avaliacao">
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Avaliação</p>
          <div className="mt-4">
            <ProReviewPanel
              myReview={reviews.myReview}
              reviewOfMe={reviews.reviewOfMe}
              myRole={role === 'agencia' ? 'booker' : role}
              otherPartyName={booking.otherPartyName}
            />
          </div>
        </ProCard>
      )}

      <details className="group">
        <summary className="font-doopla-mono cursor-pointer select-none list-none text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]">
          Ver histórico ({events.length})
        </summary>
        <ol className="mt-4 flex flex-col gap-3 border-l border-[var(--pro-line)] pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative text-sm">
              <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[var(--pro-red)]" />
              <p className="text-[var(--pro-off)]">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
                {event.commission_percent != null && ` — ${formatPercent(event.commission_percent)}`}
              </p>
              <p className="font-doopla-mono text-[11px] text-[var(--pro-tx-30)]">{formatRelativeDate(event.created_at)}</p>
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}
