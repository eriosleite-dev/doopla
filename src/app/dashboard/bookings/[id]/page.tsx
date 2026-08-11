import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';
import type { Booking, BookingEvent, Profile } from '@/lib/supabase/types';

import { advanceBookingStatusAction, respondToBookingAction } from '../../actions';
import { CommissionField } from '../../commission-field';
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
  rustGhostButtonClass,
  statusPillClasses,
  STATUS_LABELS,
} from '../../ui';

export const metadata: Metadata = {
  title: 'Booking | Doopla',
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await getSessionProfile();

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single<Booking>();

  if (!booking) notFound();
  const isParty =
    booking.artist_profile_id === user.id || booking.booker_profile_id === user.id;
  if (!isParty) redirect('/dashboard');

  const otherPartyId =
    profile.role === 'booker' ? booking.artist_profile_id : booking.booker_profile_id;
  const { data: otherParty } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', otherPartyId)
    .single<Pick<Profile, 'id' | 'full_name'>>();
  const otherPartyName = otherParty?.full_name ?? 'Alguém';

  const { data: events } = await supabase
    .from('booking_events')
    .select('*')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })
    .returns<BookingEvent[]>();

  const commissionCents = booking.cache_amount_cents
    ? Math.round((booking.cache_amount_cents * booking.commission_percent) / 100)
    : 0;
  const netCents = booking.cache_amount_cents
    ? booking.cache_amount_cents - commissionCents
    : 0;

  const isMyTurn =
    booking.status === 'proposta_enviada' && booking.proposed_by !== profile.role;
  const canAdvance = booking.status === 'aceita' || booking.status === 'aguardando_pagamento';

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={avatarClass}>{initialsFromName(otherPartyName)}</span>
          <div>
            <p className={eyebrowClass}>Booking</p>
            <h1 className="font-doopla-display mt-1 text-2xl font-semibold">
              {otherPartyName}
            </h1>
          </div>
        </div>
        <span className={statusPillClasses[booking.status]}>
          {STATUS_LABELS[booking.status]}
        </span>
      </header>

      <section className={`${cardClass} flex flex-col gap-4`}>
        {booking.description && (
          <p className="text-sm text-[var(--ink)]">{booking.description}</p>
        )}
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[12px] text-[var(--ink)]/50">Cachê</dt>
            <dd className="mt-1 font-medium">
              {booking.cache_amount_cents != null
                ? formatCentsAsBRL(booking.cache_amount_cents)
                : 'Ainda não fechado'}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-[var(--ink)]/50">Comissão</dt>
            <dd className="mt-1 font-medium">
              {formatPercent(booking.commission_percent)}
            </dd>
          </div>
          {booking.cache_amount_cents != null && (
            <>
              <div>
                <dt className="text-[12px] text-[var(--ink)]/50">Comissão em R$</dt>
                <dd className="mt-1 font-medium">{formatCentsAsBRL(commissionCents)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-[var(--ink)]/50">Artista recebe</dt>
                <dd className="mt-1 font-medium">{formatCentsAsBRL(netCents)}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <section className={`${cardClass} flex flex-col gap-4`}>
        <p className={eyebrowClass}>Próxima ação</p>
        {isMyTurn ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <form action={respondToBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="aceita" />
                <button type="submit" className={accentButtonClass}>
                  Aceitar {formatPercent(booking.commission_percent)}
                </button>
              </form>
              <form action={respondToBookingAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="recusada" />
                <button type="submit" className={rustGhostButtonClass}>
                  Recusar
                </button>
              </form>
            </div>

            <details>
              <summary className="cursor-pointer text-sm text-[var(--ink)]/70 underline decoration-[var(--accent)] decoration-2 underline-offset-4">
                Contrapropor outra comissão
              </summary>
              <form
                action={respondToBookingAction}
                className="mt-4 flex flex-col gap-4"
              >
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="decision" value="contraproposta" />
                <CommissionField
                  name="commission"
                  label="Sua contraproposta"
                  defaultValue={Number(booking.commission_percent)}
                />
                <button type="submit" className={`${primaryButtonClass} self-start`}>
                  Enviar contraproposta
                </button>
              </form>
            </details>
          </div>
        ) : booking.status === 'proposta_enviada' ? (
          <p className="text-sm text-[var(--ink)]/60">
            Aguardando resposta de {otherPartyName}.
          </p>
        ) : canAdvance ? (
          <form action={advanceBookingStatusAction} className="self-start">
            <input type="hidden" name="bookingId" value={booking.id} />
            <button type="submit" className={ghostButtonClass}>
              {booking.status === 'aceita'
                ? 'Marcar trabalho como realizado'
                : 'Marcar pagamento confirmado'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--ink)]/60">
            {booking.status === 'recusada'
              ? 'Essa proposta foi recusada.'
              : 'Booking concluído.'}
          </p>
        )}
      </section>

      {events && events.length > 0 && (
        <section>
          <p className={eyebrowClass}>Histórico</p>
          <ul className="mt-4 flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className={`${cardClass} flex items-center justify-between gap-4 !p-4 text-sm`}
              >
                <span>
                  {EVENT_LABELS[event.event_type] ?? event.event_type}
                  {event.commission_percent != null &&
                    ['proposta_enviada', 'contraproposta'].includes(event.event_type) &&
                    ` · ${formatPercent(event.commission_percent)}`}
                  {event.note && (
                    <span className="block text-[12.5px] text-[var(--ink)]/50">
                      {event.note}
                    </span>
                  )}
                </span>
                <span className="font-doopla-mono flex-none text-[11px] text-[var(--ink)]/40">
                  {formatRelativeDate(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
