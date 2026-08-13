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
