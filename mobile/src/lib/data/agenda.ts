import { supabase } from '@/lib/supabase';
import type { AgendaEntry, AgendaEntryType, AgendaEvent } from '@/types/agenda';
import type { BookingWithOtherParty } from './bookings';

export const AGENDA_ENTRY_TYPES: AgendaEntryType[] = ['disponivel', 'indisponivel', 'viagem', 'outro'];

export const AGENDA_ENTRY_TYPE_LABELS: Record<AgendaEntryType, string> = {
  disponivel: 'Disponível',
  indisponivel: 'Indisponível',
  viagem: 'Viagem',
  outro: 'Outro',
};

export async function fetchArtistAgendaEntries(artistId: string): Promise<AgendaEntry[]> {
  const { data, error } = await supabase
    .from('agenda_entries')
    .select('*')
    .eq('artist_profile_id', artistId)
    .order('start_date', { ascending: true })
    .returns<AgendaEntry[]>();
  if (error) throw error;
  return data ?? [];
}

// Portado 1:1 da regra de src/app/dashboard/data.ts (getAgendaEvents/
// expandAgendaEntry): bookings confirmados (aceita/aguardando_pagamento/
// concluida com event_date) viram 1 evento; cada agenda_entry expande
// em 1 evento por dia dentro do período [start_date, end_date].
export function buildAgendaEvents(bookings: BookingWithOtherParty[], entries: AgendaEntry[]): AgendaEvent[] {
  const events: AgendaEvent[] = bookings
    .filter((b) => b.event_date != null && (b.status === 'aceita' || b.status === 'aguardando_pagamento' || b.status === 'concluida'))
    .map((b) => ({
      date: b.event_date as string,
      kind: 'confirmado' as const,
      title: b.description || `Trabalho com ${b.otherPartyName}`,
      sub: b.event_location,
      bookingId: b.id,
      agendaEntryId: null,
    }));

  for (const entry of entries) {
    events.push(...expandAgendaEntry(entry));
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function expandAgendaEntry(entry: AgendaEntry): AgendaEvent[] {
  const out: AgendaEvent[] = [];
  let cursor = new Date(`${entry.start_date}T00:00:00`);
  const end = new Date(`${entry.end_date}T00:00:00`);
  // Teto defensivo — nenhuma marcação real deveria passar disso, evita
  // loop infinito se um dado vier corrompido.
  let guard = 0;
  while (cursor <= end && guard < 366) {
    out.push({
      date: cursor.toISOString().slice(0, 10),
      kind: entry.entry_type,
      title: AGENDA_ENTRY_TYPE_LABELS[entry.entry_type],
      sub: entry.note,
      bookingId: null,
      agendaEntryId: entry.id,
    });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    guard += 1;
  }
  return out;
}

export async function createAgendaEntry(params: {
  artistProfileId: string;
  entryType: AgendaEntryType;
  startDate: string;
  endDate: string;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.from('agenda_entries').insert({
    artist_profile_id: params.artistProfileId,
    created_by_profile_id: params.artistProfileId,
    entry_type: params.entryType,
    start_date: params.startDate,
    end_date: params.endDate,
    note: params.note,
  });
  if (error) throw error;
}

export async function deleteAgendaEntry(id: string): Promise<void> {
  const { error } = await supabase.from('agenda_entries').delete().eq('id', id);
  if (error) throw error;
}

// Grade de semanas (6 linhas x 7 colunas, começando na segunda) pro
// mês informado — função pura, só matemática de calendário.
export type CalendarDay = { date: string; day: number; inMonth: boolean };

export function buildCalendarMonth(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = segunda
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - firstWeekday);

  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        date: cursor.toISOString().slice(0, 10),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
