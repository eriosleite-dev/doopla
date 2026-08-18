import type { Metadata } from 'next';
import Link from 'next/link';

import { removeAgendaEntryAction } from '../actions';
import { AgendaEntryForm } from './agenda-entry-form';
import { buildCalendarMonth, parseMonthParam } from './calendar';
import {
  AGENDA_ENTRY_LABEL,
  getAgendaEvents,
  getArtistAgendaEntries,
  getBookerArtistRelationships,
  getUserBookings,
} from '../data';
import { getSessionProfile } from '../session';
import {
  agendaTagClass,
  calendarDayClass,
  calendarDotClass,
  cardClass,
  eyebrowClass,
} from '../ui';

export const metadata: Metadata = {
  title: 'Agenda | Doopla',
};

function formatEntryDateLabel(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
  if (startDate === endDate) return start;
  const end = new Date(`${endDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
  return `${start} a ${end}`;
}

export default async function AgendaPage(props: {
  searchParams: Promise<{ month?: string; artist?: string }>;
}) {
  const { month: monthParam, artist: selectedArtistId } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const events = await getAgendaEvents(user.id, profile.role, bookings, supabase);

  const { year, month } = parseMonthParam(monthParam);
  const calendar = buildCalendarMonth(year, month, events);

  const monthEvents = calendar.days
    .flatMap((d) => d.events.map((e) => ({ ...e, day: d.day })))
    .sort((a, b) => a.date.localeCompare(b.date));

  const myArtists = profile.role === 'booker' ? await getBookerArtistRelationships(user.id, supabase) : [];
  const activeArtistId = profile.role === 'booker' ? (selectedArtistId || myArtists[0]?.profileId || null) : null;
  const artistEntries =
    activeArtistId != null ? await getArtistAgendaEntries(activeArtistId, supabase) : [];

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Agenda</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Sua agenda</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--ink)]/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--musgo)]" /> Confirmado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Disponível
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--alert)]" /> Indisponível
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--ink)]/50" /> Viagem/outro
          </span>
        </div>
      </header>

      {profile.role === 'artista' && <AgendaEntryForm artistProfileId={user.id} />}

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
              {monthEvents.map((e, i) => {
                const info = (
                  <>
                    <span className="font-doopla-mono w-10 flex-none text-center text-lg font-semibold">
                      {e.day}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.title}</span>
                      <span className="block truncate text-[12px] text-[var(--ink)]/55">
                        {e.sub}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li
                    key={i}
                    className="flex items-center gap-4 rounded-[14px] border border-[var(--line-light)] p-3"
                  >
                    {e.bookingId ? (
                      <Link
                        href={`/dashboard/bookings/${e.bookingId}`}
                        className="flex min-w-0 flex-1 items-center gap-4 hover:opacity-70"
                      >
                        {info}
                        <span
                          aria-hidden
                          className="flex-none font-doopla-mono text-[13px] text-[var(--ink)]/30"
                        >
                          ›
                        </span>
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-4">{info}</div>
                    )}
                    <span className={agendaTagClass(e.kind)}>
                      {e.kind === 'confirmado' ? 'Confirmado' : AGENDA_ENTRY_LABEL[e.kind]}
                    </span>
                    {e.entryId && (
                      <form action={removeAgendaEntryAction}>
                        <input type="hidden" name="id" value={e.entryId} />
                        <button
                          type="submit"
                          aria-label="Remover marcação"
                          className="text-sm text-[var(--ink)]/40 hover:text-[var(--ink)]"
                        >
                          ×
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {profile.role === 'booker' && myArtists.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Agenda dos seus artistas</p>
          <p className="mt-1 text-[12.5px] text-[var(--ink)]/55">
            Marque disponibilidade, indisponibilidade, viagens ou outros compromissos na agenda
            de quem você representa.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {myArtists.map((a) => (
              <Link
                key={a.profileId}
                href={`/dashboard/agenda?artist=${a.profileId}`}
                className={`font-doopla-mono rounded-full px-3.5 py-2 text-[11px] uppercase tracking-[.04em] ${
                  a.profileId === activeArtistId
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'border border-[var(--ink)]/20 text-[var(--ink)]/65 hover:border-[var(--ink)]/40'
                }`}
              >
                {a.stageName || a.fullName}
              </Link>
            ))}
          </div>

          {activeArtistId && (
            <div className="mt-5 flex flex-col gap-4">
              <AgendaEntryForm artistProfileId={activeArtistId} />

              {artistEntries.length === 0 ? (
                <p className="text-sm text-[var(--ink)]/55">
                  Nenhuma marcação manual na agenda desse artista ainda.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {artistEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-[14px] border border-[var(--line-light)] p-3"
                    >
                      <span className={agendaTagClass(entry.entry_type)}>
                        {AGENDA_ENTRY_LABEL[entry.entry_type]}
                      </span>
                      <span className="flex-1 text-sm">
                        {formatEntryDateLabel(entry.start_date, entry.end_date)}
                        {entry.note && (
                          <span className="text-[var(--ink)]/55"> · {entry.note}</span>
                        )}
                      </span>
                      <form action={removeAgendaEntryAction}>
                        <input type="hidden" name="id" value={entry.id} />
                        <button
                          type="submit"
                          aria-label="Remover marcação"
                          className="text-sm text-[var(--ink)]/40 hover:text-[var(--ink)]"
                        >
                          ×
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
