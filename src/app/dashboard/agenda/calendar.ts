import type { AgendaEvent } from '../data';

const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

export type CalendarDay = {
  day: number;
  dateKey: string; // yyyy-mm-dd
  events: AgendaEvent[];
};

export type CalendarMonth = {
  year: number;
  month: number; // 0-11
  label: string;
  weekdayLetters: string[];
  leadingBlanks: number;
  days: CalendarDay[];
  prevParam: string;
  nextParam: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

// Achado real de QA (30/09/2026) — um registro de agenda com data "De"/
// "Até" (ex.: viagem de 10 dias) é UM registro só no banco
// (agenda_entries), mas monthEvents (abaixo, page.tsx) o expande em 1
// AgendaEvent por dia — todos com o MESMO entryId (ver expandAgendaEntry
// em data.ts). A lista "Eventos do mês" mostrava essas 10 linhas
// separadas, cada uma com seu próprio botão "×" — mas as 10 apontavam
// pro MESMO entryId, então excluir qualquer uma delas excluía o
// registro inteiro (os 10 dias), sem nenhum aviso disso. Achado ao vivo
// pela fundadora: "editei/excluí uma data e tirou todos os outros dias
// também".
//
// Correção: agrupa de volta os dias consecutivos que compartilham o
// mesmo entryId numa única linha de exibição, com o intervalo completo
// ("10–19") — mesmo padrão já usado (corretamente) na seção "Agenda dos
// seus artistas" do Booker (formatEntryDateLabel, page.tsx), só que a
// partir da lista já expandida (nunca precisa reconsultar o banco: dias
// do mesmo entryId são sempre contíguos, por construção de
// expandAgendaEntry). Eventos de booking (sem entryId) continuam 1 por
// dia, como sempre foram — só entradas manuais de intervalo mudam.
export type AgendaDisplayRow = {
  key: string;
  dayLabel: string;
  title: string;
  sub: string;
  kind: AgendaEvent['kind'];
  bookingId?: string;
  entryId?: string;
};

export function groupMonthEvents(events: (AgendaEvent & { day: number })[]): AgendaDisplayRow[] {
  const rows: AgendaDisplayRow[] = [];
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.entryId) {
      let j = i;
      while (j + 1 < events.length && events[j + 1].entryId === e.entryId) j++;
      const last = events[j];
      rows.push({
        key: e.entryId,
        dayLabel: e.day === last.day ? String(e.day) : `${e.day}–${last.day}`,
        title: e.title,
        sub: e.sub,
        kind: e.kind,
        entryId: e.entryId,
      });
      i = j + 1;
    } else {
      rows.push({ key: `${e.date}-${i}`, dayLabel: String(e.day), title: e.title, sub: e.sub, kind: e.kind, bookingId: e.bookingId });
      i++;
    }
  }
  return rows;
}

export function buildCalendarMonth(
  year: number,
  month: number,
  events: AgendaEvent[]
): CalendarMonth {
  const eventsByDate = new Map<string, AgendaEvent[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const days: CalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${pad(month + 1)}-${pad(d)}`;
    days.push({ day: d, dateKey, events: eventsByDate.get(dateKey) ?? [] });
  }

  const prevDate = new Date(year, month - 1, 1);
  const nextDate = new Date(year, month + 1, 1);

  return {
    year,
    month,
    label: `${MONTH_NAMES[month]} ${year}`,
    weekdayLetters: WEEKDAY_LETTERS,
    leadingBlanks: firstWeekday,
    days,
    prevParam: `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`,
    nextParam: `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`,
  };
}
