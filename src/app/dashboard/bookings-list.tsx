'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';
import type { BookingStatus, Profile } from '@/lib/supabase/types';

import { BOOKING_STATUS_FILTERS, type BookingWithOtherParty } from './data';
import {
  avatarClass,
  filterChipClass,
  initialsFromName,
  STATUS_LABELS,
  statusPillClasses,
} from './ui';

function bookingLine(
  booking: BookingWithOtherParty,
  role: Profile['role']
): string {
  const commissionText = `${formatPercent(booking.commission_percent)} de comissão`;
  if (booking.cache_amount_cents == null) {
    return `${commissionText} · cachê ainda não fechado`;
  }
  if (role === 'booker') {
    const commissionCents = Math.round(
      (booking.cache_amount_cents * booking.commission_percent) / 100
    );
    return `${formatCentsAsBRL(booking.cache_amount_cents)} · ${commissionText} (${formatCentsAsBRL(commissionCents)})`;
  }
  const netCents =
    booking.cache_amount_cents -
    Math.round((booking.cache_amount_cents * booking.commission_percent) / 100);
  return `${formatCentsAsBRL(booking.cache_amount_cents)} · você recebe ${formatCentsAsBRL(netCents)}`;
}

export function BookingsList({
  bookings,
  role,
}: {
  bookings: BookingWithOtherParty[];
  role: Profile['role'];
}) {
  const [filter, setFilter] = useState<BookingStatus | 'todos'>('todos');
  const filtered =
    filter === 'todos' ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {BOOKING_STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={filterChipClass(filter === f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
          Nenhum booking por aqui ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((booking) => (
            <li key={booking.id}>
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="flex items-center gap-4 rounded-[18px] bg-white p-4 transition-opacity hover:opacity-80 sm:p-5"
              >
                <span className={avatarClass}>
                  {initialsFromName(booking.otherPartyName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {booking.otherPartyName}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ink)]/55">
                    {bookingLine(booking, role)}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1.5">
                  <span className={statusPillClasses[booking.status]}>
                    {STATUS_LABELS[booking.status]}
                  </span>
                  <span className="font-doopla-mono text-[11px] text-[var(--ink)]/40">
                    {formatRelativeDate(booking.updated_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
