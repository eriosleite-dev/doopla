// Espelha agenda_entries (migration 0030) + o tipo AgendaEvent
// derivado usado no painel web (src/app/dashboard/data.ts).

export type AgendaEntryType = 'disponivel' | 'indisponivel' | 'viagem' | 'outro';

export type AgendaEntry = {
  id: string;
  artist_profile_id: string;
  created_by_profile_id: string;
  entry_type: AgendaEntryType;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
};

// Evento normalizado pro calendário — ou um booking confirmado
// (kind='confirmado', vem de bookings.event_date) ou um dia dentro do
// período de um agenda_entry (kind=entry_type, expandido dia a dia).
export type AgendaEvent = {
  date: string; // YYYY-MM-DD
  kind: 'confirmado' | AgendaEntryType;
  title: string;
  sub: string | null;
  bookingId: string | null;
  agendaEntryId: string | null;
};
