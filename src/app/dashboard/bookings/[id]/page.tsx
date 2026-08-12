import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import { markCompletedAction, markPaidAction, respondBookingAction } from '../../actions';
import { getBookingDetail } from '../../data';
import { getSessionProfile } from '../../session';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  eyebrowClass,
  EVENT_LABELS,
  ghostButtonClass,
  initialsFromName,
  primaryButtonClass,
  STATUS_LABELS,
  statusPillClasses,
} from '../../ui';
import { CounterForm } from './counter-form';

export const metadata: Metadata = {
  title: 'Negociação | Doopla',
};

export default async function BookingDetailPage(
  props: PageProps<'/dashboard/bookings/[id]'>
) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();

  const detail = await getBookingDetail(id, user.id, profile.role, supabase);
  if (!detail) notFound();

  const { booking, events, isProposer } = detail;

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

      <section className={cardClass}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <section className={cardClass}>
        <p className={eyebrowClass}>O que fazer agora</p>

        {booking.status === 'proposta_enviada' && !isProposer && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              {booking.otherPartyName} propôs {formatPercent(booking.commission_percent)} de
              comissão. Aceite, recuse ou envie uma contraproposta.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <form action={respondBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="aceitar" />
                <button type="submit" className={primaryButtonClass}>
                  Aceitar proposta
                </button>
              </form>
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
            <form action={markCompletedAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className={primaryButtonClass}>
                Marcar como realizado
              </button>
            </form>
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && profile.role === 'booker' && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-[var(--ink)]/70">
              Trabalho realizado. Quando o cliente pagar, marque o booking como concluído.
            </p>
            <form action={markPaidAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button type="submit" className={accentButtonClass}>
                Marcar como pago
              </button>
            </form>
          </div>
        )}

        {booking.status === 'aguardando_pagamento' && profile.role === 'artista' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">
            Trabalho realizado. Aguardando confirmação de pagamento por {booking.otherPartyName}.
          </p>
        )}

        {booking.status === 'recusada' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">Essa proposta foi recusada.</p>
        )}

        {booking.status === 'concluida' && (
          <p className="mt-4 text-sm text-[var(--ink)]/70">
            Booking concluído. Nada pendente por aqui.
          </p>
        )}
      </section>

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
