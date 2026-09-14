'use client';

import Link from 'next/link';

import { formatRelativeDate } from '@/lib/format';

import { bookingLine } from '../bookings-list';
import { BOOKING_ATTENTION_FILTERS, classifyBookingAttention } from '../booking-attention';
import type { BookingWithOtherParty } from '../data';
import { proStatusPillClass, bookingStatusTone } from '../pro-format';
import { ProSearchFilter } from '../pro-ui';
import { STATUS_LABELS } from '../ui';
import type { Profile } from '@/lib/supabase/types';

// Re-skin de Bookings (item 7 da revisão Professional Web Dashboard,
// 06/09/2026) — mesma lógica de dados que já existia (getUserBookings,
// bookingLine, STATUS_LABELS), só a pele muda. Booker continua vendo a
// TrabalhosList legada (trabalhos/page.tsx decide por role) — este
// componente é exclusivo da superfície profissional (artista). Filtros
// por atenção (D4, 09/09/2026): mesma classificação do App
// (classifyBookingForChip), nunca um agrupamento divergente por
// status cru.
export function ProTrabalhosView({
  bookings,
  role,
  userId,
  conversationIdByBookingId,
  pendingReviewBookingIds = [],
}: {
  bookings: BookingWithOtherParty[];
  role: Profile['role'];
  userId: string;
  conversationIdByBookingId: Record<string, string>;
  pendingReviewBookingIds?: string[];
}) {
  const needsReviewSet = new Set(pendingReviewBookingIds);
  return (
    <ProSearchFilter
      items={bookings}
      getSearchText={(b) => `${b.otherPartyName} ${b.description ?? ''} ${bookingLine(b, role)}`}
      searchPlaceholder="Buscar por cliente, trabalho..."
      statusFilters={BOOKING_ATTENTION_FILTERS}
      getStatus={(b) => classifyBookingAttention(b, userId)}
      itemLabel={{ singular: 'booking encontrado', plural: 'bookings encontrados' }}
      emptyMessage="Nenhum booking encontrado com esses filtros."
      renderItem={(b) => {
        const conversationId = conversationIdByBookingId[b.id];
        return (
          <div
            key={b.id}
            className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-4 backdrop-blur-xl sm:flex-nowrap"
          >
            <Link href={`/dashboard/bookings/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-[var(--pro-off)]">{b.otherPartyName}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--pro-tx-50)]">{bookingLine(b, role)}</p>
                {b.event_date && (
                  <p className="font-doopla-mono mt-1 text-[10.5px] text-[var(--pro-tx-30)]">
                    {new Date(`${b.event_date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {b.event_location ? ` · ${b.event_location}` : ''}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex flex-none flex-col items-end gap-1.5">
              <span className={proStatusPillClass(bookingStatusTone(b, userId))}>{STATUS_LABELS[b.status] ?? b.status}</span>
              <span className="font-doopla-mono text-[10px] text-[var(--pro-tx-30)]">{formatRelativeDate(b.updated_at)}</span>
            </div>
            {needsReviewSet.has(b.id) && (
              <Link
                href={`/dashboard/bookings/${b.id}/avaliar`}
                className="font-pro-sub flex-none rounded-full bg-[var(--pro-red)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--pro-off)] shadow-[0_0_16px_rgba(226,41,28,.3)]"
              >
                Avaliar
              </Link>
            )}
            {conversationId && (
              <Link
                href={`/dashboard/bookings/${b.id}/conversa/${conversationId}`}
                className="font-pro-sub flex-none rounded-full border border-[var(--pro-line)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]"
              >
                Ver conversa
              </Link>
            )}
          </div>
        );
      }}
    />
  );
}
