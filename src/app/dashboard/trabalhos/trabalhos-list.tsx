'use client';

import { bookingLine, BookingRow } from '../bookings-list';
import { BOOKING_STATUS_FILTERS, type BookingWithOtherParty } from '../data';
import { ListFilter } from '../list-filter';
import type { Profile } from '@/lib/supabase/types';

export function TrabalhosList({
  bookings,
  role,
}: {
  bookings: BookingWithOtherParty[];
  role: Profile['role'];
}) {
  return (
    <ListFilter
      items={bookings}
      getKey={(b) => b.id}
      searchPlaceholder={
        role === 'booker' ? 'Buscar por artista, trabalho...' : 'Buscar por booker, trabalho...'
      }
      getSearchText={(b) => `${b.otherPartyName} ${b.description ?? ''} ${bookingLine(b, role)}`}
      statusFilters={BOOKING_STATUS_FILTERS}
      getStatus={(b) => b.status}
      renderItem={(b) => <BookingRow booking={b} role={role} />}
      emptyMessage="Nenhum trabalho encontrado com esses filtros."
      itemLabel={{ singular: 'trabalho encontrado', plural: 'trabalhos encontrados' }}
    />
  );
}
