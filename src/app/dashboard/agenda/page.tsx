import type { Metadata } from 'next';
import Link from 'next/link';

import { addAvailabilityAction, removeAvailabilityAction } from '../actions';
import { buildCalendarMonth, parseMonthParam } from './calendar';
import { getAgendaEvents, getUserBookings } from '../data';
import { getSessionProfile } from '../session';
import {
  agendaTagClass,
  calendarDayClass,
  calendarDotClass,
  cardClass,
  eyebrowClass,
  ghostButtonClass,
} from '../ui';

export const metadata: Metadata = {
  title: 'Agenda | Doopla',
};

export default async function AgendaPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const events = await getAgendaEvents(user.id, profile.role, bookings, supabase);

  const { year, month } = parseMonthParam(monthParam);
  const calendar = buildCalendarMonth(year, month, events);

  const monthEvents = calendar.days
    .flatMap((d) => d.events.map((e) => ({ ...e, day: d.day })))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Agenda</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Sua agenda</h1>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-[var(--ink)]/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musgo)]" /> Trabalho confirmado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Disponibilidade marcada
          </span>
        </div>
      </header>

      {profile.role === 'artista' && (
        <form action={addAvailabilityAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={eyebrowClass}>Marcar disponibilidade</span>
            <input
              type="date"
              name="date"
              required
              className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            />
          </label>
          <button type="submit" className={ghostButtonClass}>
            + Marcar disponibilidade
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-center gap-5">
            <Link
              href={`/dashboard/agenda?month=${calendar.prevParam}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-light)] text-sm hover:border-[var(--accent)]"
            >
              ‹
            </Link>
            <span className="font-doopla-mono text-[12px] font-semibold tracking-[.06em] text-[var(--accent-ink)]">
              {calendar.label}
            </span>
            <Link
              href={`/dashboard/agenda?month=${calendar.nextParam}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-light)] text-sm hover:border-[var(--accent)]"
            >
              ›
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.weekdayLetters.map((letter, i) => (
              <div
                key={i}
                className="font-doopla-mono pb-2 text-center text-[10px] uppercase text-[var(--ink)]/40"
              >
                {letter}
              </div>
            ))}
            {Array.from({ length: calendar.leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {calendar.days.map((d) => (
              <div key={d.dateKey} className={calendarDayClass(d.events.length > 0)}>
                {d.day}
                {d.events.map((e, i) => (
                  <span
                    key={i}
                    className={calendarDotClass(e.kind)}
                    style={
                      d.events.length > 1
                        ? { left: `${50 + (i - (d.events.length - 1) / 2) * 10}%` }
                        : undefined
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <p className={eyebrowClass}>Eventos de {calendar.label.toLowerCase()}</p>
          {monthEvents.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink)]/55">Nada marcado neste mês.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {monthEvents.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center gap-4 rounded-[14px] border border-[var(--line-light)] p-3"
                >
                  <span className="font-doopla-mono w-10 flex-none text-center text-lg font-semibold">
                    {e.day}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    <span className="block truncate text-[12px] text-[var(--ink)]/55">
                      {e.sub}
                    </span>
                  </span>
                  <span className={agendaTagClass(e.kind)}>
                    {e.kind === 'confirmado' ? 'Confirmado' : 'Disponível'}
                  </span>
                  {e.availabilityId && (
                    <form action={removeAvailabilityAction}>
                      <input type="hidden" name="id" value={e.availabilityId} />
                      <button
                        type="submit"
                        aria-label="Remover disponibilidade"
                        className="text-sm text-[var(--ink)]/40 hover:text-[var(--ink)]"
                      >
                        ×
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
