import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';
import { getConversationIdForBooking, getConversationOperationalFacts } from '@/lib/conversations/data';

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
import { getBookingCheckpoints, getBookingDetail, getBookingReviews, isDooplaVerified } from '../../data';
import { getSessionProfile } from '../../session';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  CONVERSATION_STATE_LABELS,
  conversationStatePillClasses,
  cpDotClass,
  cpLabelClass,
  eyebrowClass,
  EVENT_LABELS,
  ghostButtonClass,
  initialsFromName,
  primaryButtonClass,
  STATUS_LABELS,
  statusPillClasses,
  verifyBadgeClass,
} from '../../ui';
import { CancelBookingForm } from './cancel-booking-form';
import { ContractSection } from './contract-section';
import { CounterForm } from './counter-form';
import { InvoiceTermForm } from './invoice-term-form';
import { RescheduleForm } from './reschedule-form';
import { ReviewPanel } from './review-panel';

export const metadata: Metadata = {
  title: 'Negociação | Doopla',
};

function paymentPolicySummary(booking: {
  payment_mode: string;
  deposit_percentage: number | null;
  remaining_due_rule: string | null;
  client_cancellation_deposit_refundable: boolean;
  artist_cancellation_deposit_refundable: boolean;
}): string[] {
  const lines: string[] = [];
  if (booking.payment_mode === 'sinal_saldo' && booking.deposit_percentage != null) {
    lines.push(
      `Sinal de ${formatPercent(booking.deposit_percentage)}, saldo ${
        booking.remaining_due_rule ? `vence ${booking.remaining_due_rule}` : 'combinado à parte'
      }.`
    );
  } else {
    lines.push('100% do pagamento ocorre após o trabalho.');
  }
  lines.push(
    booking.client_cancellation_deposit_refundable
      ? 'Se o cliente cancelar, o sinal é reembolsável a ele.'
      : 'Se o cliente cancelar, o sinal não é reembolsável.'
  );
  lines.push(
    booking.artist_cancellation_deposit_refundable
      ? 'Se o artista cancelar, o cliente tem direito ao sinal de volta.'
      : 'Se o artista cancelar, o sinal não é devolvido ao cliente.'
  );
  return lines;
}

type PaymentDueState = 'a_vencer' | 'vencido' | 'em_cobranca';

function paymentDueState(booking: {
  payment_due_at: string | null;
  payment_collection_started_at: string | null;
}): PaymentDueState | null {
  if (!booking.payment_due_at) return null;
  if (booking.payment_collection_started_at) return 'em_cobranca';
  return new Date(booking.payment_due_at).getTime() < Date.now() ? 'vencido' : 'a_vencer';
}

const PAYMENT_DUE_LABELS: Record<PaymentDueState, string> = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  em_cobranca: 'Em cobrança',
};

const PAYMENT_DUE_CLASSES: Record<PaymentDueState, string> = {
  a_vencer: 'bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]',
  vencido: 'bg-[var(--alert)]/15 text-[var(--alert)]',
  em_cobranca: 'bg-[var(--alert)]/25 text-[var(--alert)]',
};

const DISPUTE_LABELS: Record<string, string> = {
  em_disputa: 'Em disputa',
  chargeback: 'Chargeback aberto',
};

// Etapas do faturamento direto (LOTE 2 Parte 2, item 18) — computadas a
// partir dos timestamps do booking, mesmo padrão de "A vencer/Vencido"
// já usado acima. Nunca um status global novo.
function invoiceStages(booking: {
  invoice_terms_accepted_at: string | null;
  invoice_issued_at: string | null;
  invoice_sent_to_client_at: string | null;
  invoice_client_paid_at: string | null;
  invoice_commission_paid_at: string | null;
}) {
  return [
    { key: 'aceite', label: 'Condições aceitas', done: booking.invoice_terms_accepted_at != null },
    { key: 'emitida', label: 'NF emitida', done: booking.invoice_issued_at != null },
    { key: 'enviada', label: 'Enviada ao cliente', done: booking.invoice_sent_to_client_at != null },
    { key: 'recebida', label: 'Pagamento recebido', done: booking.invoice_client_paid_at != null },
    { key: 'comissao', label: 'Comissão paga', done: booking.invoice_commission_paid_at != null },
  ];
}

export default async function BookingDetailPage(
  props: PageProps<'/dashboard/bookings/[id]'>
) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();

  const detail = await getBookingDetail(id, user.id, profile.role, supabase);
  if (!detail) notFound();

  const { booking, events, isProposer } = detail;
  const checkpoints = getBookingCheckpoints(booking);
  const verified = isDooplaVerified(booking);
  const hasActiveCheckpoints = !['proposta_enviada', 'recusada', 'cancelada'].includes(booking.status);
  const reviews =
    booking.status === 'concluida'
      ? await getBookingReviews(booking.id, user.id, supabase)
      : null;

  // Conversas Bloco 2 — "Ver conversa" só existe pra quem a Doopla
  // representa (represented_professional_id É sempre o artista, nunca
  // o booker): um booker olhando este mesmo booking nunca tem
  // conversation nenhuma sua aqui, RLS devolveria vazio de qualquer
  // forma, mas a checagem de role evita a query à toa.
  const conversationId =
    profile.role === 'artista' && booking.artist_profile_id === user.id
      ? await getConversationIdForBooking(supabase, booking.id, user.id)
      : null;
  const conversationFacts = conversationId ? await getConversationOperationalFacts(supabase, conversationId) : null;

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

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={avatarClass}>{initialsFromName(booking.otherPartyName)}</span>
          <div>
            <p className={eyebrowClass}>Negociação</p>
            <h1 className="font-doopla-display mt-1 text-2xl font-semibold">
              {booking.otherPartyName}
            </h1>
          </div>
        </div>
        <span className={statusPillClasses[booking.status]}>
          {STATUS_LABELS[booking.status]}
        </span>
      </header>

      {conversationId && conversationFacts && (
        <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <p className={eyebrowClass}>Conversa com {booking.otherPartyName}</p>
            <p className="mt-1 text-sm text-[var(--ink)]/70">
              {conversationFacts.lastMessageCreatedAt
                ? `Última mensagem ${formatRelativeDate(conversationFacts.lastMessageCreatedAt)}`
                : 'Nenhuma mensagem ainda'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={conversationStatePillClasses[conversationFacts.state]}>
              {CONVERSATION_STATE_LABELS[conversationFacts.state]}
            </span>
            <Link href={`/dashboard/bookings/${booking.id}/conversa/${conversationId}`} className={ghostButtonClass}>
              Ver conversa
            </Link>
          </div>
        </section>
      )}

      <section className={cardClass}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={eyebrowClass}>Comissão proposta</dt>
            <dd className="font-doopla-display mt-1 text-2xl font-semibold">
              {formatPercent(booking.commission_percent)}
            </dd>
          </div>
          <div>
            <dt className={eyebrowClass}>Cachê</dt>
            <dd className="font-doopla-display mt-1 text-2xl font-semibold">
              {booking.cache_amount_cents != null
                ? formatCentsAsBRL(booking.cache_amount_cents)
                : 'Ainda não fechado'}
            </dd>
          </div>
          <div>
            <dt className={eyebrowClass}>Data do trabalho</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {booking.event_date
                ? new Date(`${booking.event_date}T00:00:00`).toLocaleDateString('pt-BR')
                : 'A confirmar'}
            </dd>
            {booking.original_event_date && booking.original_event_date !== booking.event_date && (
              <dd className="mt-1 text-[11.5px] text-[var(--ink)]/45">
                Remarcado — era{' '}
                {new Date(`${booking.original_event_date}T00:00:00`).toLocaleDateString('pt-BR')}
              </dd>
            )}
          </div>
          <div>
            <dt className={eyebrowClass}>Última atualização</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {formatRelativeDate(booking.updated_at)}
            </dd>
          </div>
        </dl>
        {booking.description && (
          <p className="mt-6 border-t border-[var(--line-light)] pt-6 text-sm text-[var(--ink)]/75">
            {booking.description}
          </p>
        )}
      </section>

      {booking.requires_invoice === 'sim' && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-doopla-mono inline-block rounded-full bg-[var(--alert)]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-[.05em] text-[var(--alert)]">
              Nota fiscal necessária
            </span>
            <span className="text-[13px] text-[var(--ink)]/60">Pagamento direto ao artista</span>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className={eyebrowClass}>Prazo de pagamento</dt>
              <dd className="mt-1 text-sm">{booking.invoice_payment_term ?? 'A confirmar'}</dd>
            </div>
            <div>
              <dt className={eyebrowClass}>Pagamento da comissão</dt>
              <dd className="mt-1 text-sm">Pelo artista, após o recebimento do cliente</dd>
            </div>
          </dl>

          {profile.role === 'booker' && !['recusada', 'cancelada'].includes(booking.status) && (
            <div className="mt-3">
              <InvoiceTermForm bookingId={booking.id} currentTerm={booking.invoice_payment_term} />
            </div>
          )}

          <div className="mt-4 rounded-[12px] bg-[var(--alert)]/5 p-3.5 text-[12.5px] leading-relaxed text-[var(--ink)]/70">
            <p className="font-medium text-[var(--ink)]">Pagamento externo</p>
            <p className="mt-1">
              Este trabalho será faturado diretamente pelo artista ao contratante e não terá o
              pagamento processado pela Doopla. As proteções de pagamento da Doopla não se aplicam
              ao valor pago diretamente entre as partes.
            </p>
          </div>

          {booking.status !== 'proposta_enviada' && booking.status !== 'recusada' && (
            <div className="mt-5 border-t border-[var(--line-light)] pt-4">
              <p className={eyebrowClass}>Acompanhamento do faturamento</p>
              <div className="mt-3 flex gap-2">
                {invoiceStages(booking).map((s) => (
                  <div key={s.key} className="flex-1 text-center">
                    <div className={cpDotClass(s.done)}>{s.done ? '✓' : '!'}</div>
                    <p className={cpLabelClass(s.done)}>{s.label}</p>
                  </div>
                ))}
              </div>

              {profile.role === 'artista' && booking.status !== 'cancelada' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!booking.invoice_issued_at && (
                    <form action={markInvoiceIssuedAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={ghostButtonClass}>
                        Marcar NF como emitida
                      </button>
                    </form>
                  )}
                  {booking.invoice_issued_at && !booking.invoice_sent_to_client_at && (
                    <form action={markInvoiceSentAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={ghostButtonClass}>
                        Marcar como enviada ao cliente
                      </button>
                    </form>
                  )}
                  {booking.invoice_sent_to_client_at && !booking.invoice_client_paid_at && (
                    <form action={markInvoiceClientPaidAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={accentButtonClass}>
                        Marcar pagamento recebido do cliente
                      </button>
                    </form>
                  )}
                  {booking.invoice_client_paid_at && !booking.invoice_commission_paid_at && (
                    <form action={markInvoiceCommissionPaidAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={accentButtonClass}>
                        Marcar comissão como paga
                      </button>
                    </form>
                  )}
                </div>
              )}

              {booking.invoice_client_paid_at &&
                !booking.invoice_commission_paid_at &&
                booking.cache_amount_cents != null && (
                  <p className="mt-3 text-sm text-[var(--ink)]/70">
                    Comissão pendente:{' '}
                    {formatCentsAsBRL(
                      Math.round((booking.cache_amount_cents * booking.commission_percent) / 100)
                    )}
                  </p>
                )}
            </div>
          )}
        </section>
      )}

      {hasActiveCheckpoints && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Checkpoints</p>
          <div className="mt-4 flex gap-2">
            {checkpoints.map((cp) => (
              <div key={cp.key} className="flex-1 text-center">
                <div className={cpDotClass(cp.done)}>{cp.done ? '✓' : '!'}</div>
                <p className={cpLabelClass(cp.done)}>{cp.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--line-light)] pt-4">
            <span className={verifyBadgeClass(verified)}>
              {verified ? '✓ Doopla Verified' : '○ Aguardando validação'}
            </span>
            {!verified && profile.role === 'artista' && (
              <p className="mt-2 text-[12.5px] text-[var(--ink)]/60">
                Este trabalho ainda não possui Doopla Verified. Fale com {booking.otherPartyName}{' '}
                para enviar a validação ao cliente.
              </p>
            )}
            {!verified && profile.role === 'booker' && (
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled
                  className="font-doopla-mono cursor-not-allowed rounded-full border border-[var(--ink)]/15 px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/35"
                >
                  Reenviar link de validação
                </button>
                <span className="text-[12.5px] text-[var(--ink)]/45">Em breve</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className={cardClass}>
        <p className={eyebrowClass}>O que fazer agora</p>

        {booking.status === 'proposta_enviada' && !isProposer && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              {booking.otherPartyName} propôs {formatPercent(booking.commission_percent)} de
              comissão. Aceite, recuse ou envie uma contraproposta.
            </p>

            <div className="rounded-[14px] bg-[var(--paper-dim)] p-4 text-[12.5px] text-[var(--ink)]/70">
              <p className={eyebrowClass}>Condições de cancelamento</p>
              <ul className="mt-2 flex flex-col gap-1">
                {paymentPolicySummary(booking).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <form action={respondBookingAction} className="flex flex-col gap-3">
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="decision" value="aceitar" />
              <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--ink)]/70">
                <input type="checkbox" name="cancellationAccepted" required className="mt-0.5 h-4 w-4" />
                Li e aceito as condições de cancelamento acima.
              </label>
              {booking.requires_invoice === 'sim' && (
                <label className="flex items-start gap-2.5 text-[12.5px] text-[var(--ink)]/70">
                  <input type="checkbox" name="invoiceTermsAccepted" required className="mt-0.5 h-4 w-4" />
                  Estou ciente de que este trabalho exige Nota Fiscal, que o pagamento será feito
                  diretamente ao artista e que minha comissão será paga pelo artista após o
                  recebimento do cliente.
                </label>
              )}
              <button type="submit" className={`${primaryButtonClass} self-start`}>
                Aceitar proposta
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <CounterForm bookingId={booking.id} />
              <form action={respondBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="recusar" />
                <button type="submit" className={ghostButtonClass}>
                  Recusar
                </button>
              </form>
            </div>
          </div>
        )}

        {booking.status === 'proposta_enviada' && isProposer && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">
            Sua proposta foi enviada. Aguardando resposta de {booking.otherPartyName}.
          </p>
        )}

        {booking.status === 'aceita' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              Proposta aceita. Quando o trabalho acontecer, marque como realizado pra liberar
              o pagamento.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <form action={markCompletedAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="bookingId" value={booking.id} />
                <label className="flex flex-col gap-1.5">
                  <span className={eyebrowClass}>Vencimento do pagamento (opcional)</span>
                  <input
                    type="date"
                    name="paymentDueAt"
                    className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
                  />
                </label>
                <button type="submit" className={primaryButtonClass}>
                  Marcar como realizado
                </button>
              </form>
              <RescheduleForm
                bookingId={booking.id}
                role={profile.role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={user.id === booking.reschedule_proposed_by}
              />
              {profile.role === 'artista' && (
                <CancelBookingForm bookingId={booking.id} policyLines={paymentPolicySummary(booking)} />
              )}
            </div>
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && profile.role === 'booker' && booking.requires_invoice === 'sim' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">
            Trabalho realizado. Este é um trabalho com Nota Fiscal — acompanhe o faturamento e a
            comissão pendente na seção acima.
          </p>
        )}

        {booking.status === 'aguardando_pagamento' && profile.role === 'booker' && booking.requires_invoice !== 'sim' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              Trabalho realizado. Quando o cliente pagar, marque o booking como concluído.
            </p>

            {(() => {
              const dueState = paymentDueState(booking);
              if (!dueState) return null;
              return (
                <div className="flex items-center gap-3">
                  <span
                    className={`font-doopla-mono inline-block rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.06em] ${PAYMENT_DUE_CLASSES[dueState]}`}
                  >
                    {PAYMENT_DUE_LABELS[dueState]}
                  </span>
                  {dueState === 'vencido' && (
                    <form action={markInCollectionAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className={ghostButtonClass}>
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
                <button type="submit" className={accentButtonClass}>
                  Marcar como pago
                </button>
              </form>
              <RescheduleForm
                bookingId={booking.id}
                role={profile.role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={user.id === booking.reschedule_proposed_by}
              />
            </div>

            {booking.dispute_status === 'nenhuma' ? (
              <details className="group">
                <summary className="font-doopla-mono cursor-pointer select-none list-none text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/45 hover:text-[var(--ink)]">
                  Problema com o pagamento? Marcar disputa/chargeback
                </summary>
                <form action={markDisputeAction} className="mt-3 flex flex-wrap items-center gap-3">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <select
                    name="disputeStatus"
                    defaultValue="em_disputa"
                    className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
                  >
                    <option value="em_disputa">Cliente abriu disputa</option>
                    <option value="chargeback">Chargeback no cartão</option>
                  </select>
                  <button type="submit" className={ghostButtonClass}>
                    Registrar
                  </button>
                </form>
              </details>
            ) : (
              <p className="text-sm text-[var(--alert)]">
                {DISPUTE_LABELS[booking.dispute_status]}
                {booking.dispute_opened_at && ` — ${formatRelativeDate(booking.dispute_opened_at)}`}.
                Sempre separado de cancelamento; execução financeira ainda depende do contrato
                de credenciamento.
              </p>
            )}
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && profile.role === 'artista' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              {booking.requires_invoice === 'sim'
                ? 'Trabalho realizado. Este é um trabalho com Nota Fiscal — marque as etapas do faturamento na seção acima.'
                : `Trabalho realizado. Aguardando confirmação de pagamento por ${booking.otherPartyName}.`}
            </p>
            {booking.requires_invoice !== 'sim' &&
              (() => {
                const dueState = paymentDueState(booking);
                if (!dueState) return null;
                return (
                  <span
                    className={`font-doopla-mono inline-block w-fit rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.06em] ${PAYMENT_DUE_CLASSES[dueState]}`}
                  >
                    {PAYMENT_DUE_LABELS[dueState]}
                  </span>
                );
              })()}
            {booking.requires_invoice !== 'sim' && booking.dispute_status !== 'nenhuma' && (
              <p className="text-sm text-[var(--alert)]">
                {DISPUTE_LABELS[booking.dispute_status]}
                {booking.dispute_opened_at && ` — ${formatRelativeDate(booking.dispute_opened_at)}`}.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <RescheduleForm
                bookingId={booking.id}
                role={profile.role}
                eventDate={booking.event_date}
                proposedDate={booking.reschedule_proposed_date}
                isProposer={user.id === booking.reschedule_proposed_by}
              />
              <CancelBookingForm bookingId={booking.id} policyLines={paymentPolicySummary(booking)} />
            </div>
          </div>
        )}

        {booking.status === 'recusada' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">Essa proposta foi recusada.</p>
        )}

        {booking.status === 'concluida' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">
            Booking concluído. Nada pendente por aqui.
          </p>
        )}

        {booking.status === 'cancelada' && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-[var(--ink)]/70">
              Cancelado {booking.cancelled_at ? formatRelativeDate(booking.cancelled_at) : ''}
              {booking.cancellation_initiator === 'cliente'
                ? ' — o cliente desistiu.'
                : ' — pelo artista.'}
              {booking.cancellation_reason && ` Motivo: ${booking.cancellation_reason}`}
            </p>
            <div className="rounded-[14px] bg-[var(--paper-dim)] p-4 text-[12.5px] text-[var(--ink)]/70">
              <p className={eyebrowClass}>O que a política dizia</p>
              <ul className="mt-2 flex flex-col gap-1">
                {paymentPolicySummary(booking).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 text-[var(--ink)]/50">
                Execução de eventual reembolso ainda depende da integração real de pagamento.
              </p>
            </div>
          </div>
        )}
      </section>

      {hasActiveCheckpoints && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Contrato</p>
          <div className="mt-4">
            <ContractSection booking={booking} />
          </div>
        </section>
      )}

      {reviews && (
        <section id="avaliacao" className={cardClass}>
          <p className={eyebrowClass}>Avaliação</p>
          <div className="mt-4">
            <ReviewPanel
              myReview={reviews.myReview}
              reviewOfMe={reviews.reviewOfMe}
              myRole={profile.role === 'agencia' ? 'booker' : profile.role}
              otherPartyName={booking.otherPartyName}
            />
          </div>
        </section>
      )}

      <details className="group">
        <summary className={`${eyebrowClass} cursor-pointer select-none list-none`}>
          Ver histórico ({events.length})
        </summary>
        <ol className="mt-4 flex flex-col gap-3 border-l border-[var(--line-light)] pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative text-sm">
              <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
              <p className="text-[var(--ink)]">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
                {event.commission_percent != null &&
                  ` — ${formatPercent(event.commission_percent)}`}
              </p>
              <p className="font-doopla-mono text-[11px] text-[var(--ink)]/45">
                {formatRelativeDate(event.created_at)}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}
