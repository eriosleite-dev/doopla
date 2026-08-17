import Link from 'next/link';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';
import type { Profile } from '@/lib/supabase/types';

import type { BookingWithOtherParty } from './data';
import { avatarClass, ghostButtonClass, initialsFromName, STATUS_LABELS, statusPillClasses } from './ui';

export function bookingLine(
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

export function BookingRow({
  booking,
  role,
}: {
  booking: BookingWithOtherParty;
  role: Profile['role'];
}) {
  return (
    <Link
      href={`/dashboard/bookings/${booking.id}`}
      className="flex items-center gap-4 rounded-[18px] bg-white p-4 transition-opacity hover:opacity-80 sm:p-5"
    >
      <span className={avatarClass}>{initialsFromName(booking.otherPartyName)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{booking.otherPartyName}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--ink)]/55">
          {bookingLine(booking, role)}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1.5">
        <span className={statusPillClasses[booking.status]}>{STATUS_LABELS[booking.status]}</span>
        <span className="font-doopla-mono text-[11px] text-[var(--ink)]/40">
          {formatRelativeDate(booking.updated_at)}
        </span>
      </span>
    </Link>
  );
}

const EMPTY_STATE_CTAS: Record<Profile['role'], { label: string; href: string }[]> = {
  booker: [
    { label: 'Encontrar artistas', href: '/dashboard/artistas#descubra' },
    { label: 'Nova proposta', href: '/dashboard/propor' },
    { label: 'Convidar artista', href: '/dashboard/artistas#convites' },
  ],
  agencia: [
    { label: 'Encontrar artistas', href: '/dashboard/artistas#descubra' },
    { label: 'Nova proposta', href: '/dashboard/propor' },
    { label: 'Convidar artista', href: '/dashboard/artistas#convites' },
  ],
  artista: [
    { label: 'Publicar um trabalho', href: '/dashboard/publicar-trabalho' },
    { label: 'Ver oportunidades', href: '/dashboard/oportunidades' },
    { label: 'Encontrar um booker', href: '/dashboard/bookers#descubra' },
  ],
};

// Prévia da Home: só os mais recentes, sem busca/filtro — a tela cheia
// (com busca+filtro+ordenação) mora em /dashboard/trabalhos.
export function BookingsPreview({
  bookings,
  role,
  limit = 5,
}: {
  bookings: BookingWithOtherParty[];
  role: Profile['role'];
  limit?: number;
}) {
  const preview = bookings.slice(0, limit);

  if (preview.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white p-8 text-center">
        <p className="text-sm text-[var(--ink)]/70">Você ainda não tem bookings.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {EMPTY_STATE_CTAS[role].map((cta) => (
            <Link key={cta.href} href={cta.href} className={ghostButtonClass}>
              {cta.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {preview.map((booking) => (
        <li key={booking.id}>
          <BookingRow booking={booking} role={role} />
        </li>
      ))}
    </ul>
  );
}
