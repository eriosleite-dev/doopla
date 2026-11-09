'use client';

import Link from 'next/link';
import { useState } from 'react';

import { removeAgendaEntryAction } from '../actions';
import type { AgendaEntry } from '@/lib/supabase/types';
import type { AgendaEventKind } from '../ui';
import { ProCard, ProPageHeader } from '../pro-ui';
import { groupMonthEvents, type CalendarMonth } from './calendar';
import { ProAgendaEntryEditForm } from './pro-agenda-entry-edit-form';
import { ProAgendaEntryForm } from './pro-agenda-entry-form';

// Re-skin de Agenda (item 8 da revisão Professional Web Dashboard,
// 06/09/2026) — mesma lógica de dados (buildCalendarMonth, getAgendaEvents,
// CRUD de agenda_entries via addAgendaEntryAction/removeAgendaEntryAction),
// só a apresentação muda. A legenda antiga usava texto na cor --ink
// (quase preto), pensada pro tema claro legado — renderizada dentro do
// novo Shell escuro, ficava praticamente ilegível (achado confirmado da
// revisão). Aqui o texto é sempre --pro-tx-50/70, nunca --ink.
const AGENDA_DOT_COLOR: Record<AgendaEventKind, string> = {
  confirmado: 'bg-[var(--pro-green)]',
  disponivel: 'bg-[var(--pro-amber)]',
  indisponivel: 'bg-[var(--pro-red)]',
  viagem: 'bg-[var(--pro-tx-30)]',
  outro: 'bg-[var(--pro-tx-30)]',
};

const AGENDA_TAG_COLOR: Record<AgendaEventKind, string> = {
  confirmado: 'bg-[rgba(62,207,110,.15)] text-[var(--pro-green)]',
  disponivel: 'bg-[rgba(245,166,35,.15)] text-[var(--pro-amber)]',
  indisponivel: 'bg-[rgba(226,41,28,.15)] text-[var(--pro-red)]',
  viagem: 'bg-white/[0.06] text-[var(--pro-tx-70)]',
  outro: 'bg-white/[0.06] text-[var(--pro-tx-70)]',
};

const AGENDA_LEGEND: { kind: AgendaEventKind; label: string }[] = [
  { kind: 'confirmado', label: 'Confirmado' },
  { kind: 'disponivel', label: 'Disponível' },
  { kind: 'indisponivel', label: 'Indisponível' },
  { kind: 'viagem', label: 'Viagem/outro' },
];

export function ProAgendaView({
  calendar,
  monthEvents,
  artistProfileId,
  agendaEntryLabel,
  entries,
}: {
  calendar: CalendarMonth;
  monthEvents: (import('../data').AgendaEvent & { day: number })[];
  artistProfileId: string;
  agendaEntryLabel: Record<string, string>;
  // Registros crus (start_date/end_date/note reais, nunca truncados pelo
  // mês em exibição) — só pra pré-preencher o formulário de edição, ver
  // comentário em page.tsx sobre por que monthEvents não serve pra isso.
  entries: AgendaEntry[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  return (
    <main>
      <ProPageHeader
        title="Agenda"
        subtitle="Sua disponibilidade real. Alterações aqui não afetam bookings já confirmados."
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--pro-tx-50)]">
            {AGENDA_LEGEND.map((l) => (
              <span key={l.kind} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${AGENDA_DOT_COLOR[l.kind]}`} /> {l.label}
              </span>
            ))}
          </div>
        }
      />

      {/* gap-6 (pass de hierarquia global, 07/10/2026) — 24px entre os
         3 cards de função diferente (formulário/calendário/eventos). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProAgendaEntryForm artistProfileId={artistProfileId} />

        <ProCard>
          <div className="mb-4 flex items-center justify-center gap-5">
            <Link
              href={`/dashboard/agenda?month=${calendar.prevParam}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--pro-line)] text-[13px] text-[var(--pro-tx-70)] hover:border-[var(--pro-tx-30)]"
            >
              ‹
            </Link>
            <span className="font-doopla-mono text-[12px] font-semibold tracking-[.06em] text-[var(--pro-off)]">{calendar.label}</span>
            <Link
              href={`/dashboard/agenda?month=${calendar.nextParam}`}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--pro-line)] text-[13px] text-[var(--pro-tx-70)] hover:border-[var(--pro-tx-30)]"
            >
              ›
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendar.weekdayLetters.map((letter, i) => (
              <div key={i} className="font-doopla-mono pb-2 text-center text-[10px] uppercase text-[var(--pro-tx-30)]">
                {letter}
              </div>
            ))}
            {Array.from({ length: calendar.leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {calendar.days.map((d) => (
              <div
                key={d.dateKey}
                className={`relative flex aspect-square items-center justify-center rounded-[10px] text-[13px] ${
                  d.events.length > 0 ? 'bg-white/[0.05] font-semibold text-[var(--pro-off)]' : 'text-[var(--pro-tx-70)]'
                }`}
              >
                {d.day}
                {d.events.map((e, i) => (
                  <span
                    key={i}
                    className={`absolute bottom-[6px] h-[5px] w-[5px] rounded-full ${AGENDA_DOT_COLOR[e.kind]}`}
                    style={d.events.length > 1 ? { left: `${50 + (i - (d.events.length - 1) / 2) * 10}%` } : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Eventos de {calendar.label.toLowerCase()}</p>
          {monthEvents.length === 0 ? (
            <p className="mt-4 text-[13px] text-[var(--pro-tx-50)]">Nada marcado neste mês.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {groupMonthEvents(monthEvents).map((row) => {
                const entry = row.entryId ? entryById.get(row.entryId) : undefined;
                if (row.entryId && entry && editingId === row.entryId) {
                  return (
                    <li key={row.key} className="rounded-[14px] border border-[var(--pro-line)] p-3">
                      <ProAgendaEntryEditForm
                        entryId={entry.id}
                        initialType={entry.entry_type}
                        initialStartDate={entry.start_date}
                        initialEndDate={entry.end_date}
                        initialNote={entry.note ?? ''}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  );
                }
                const info = (
                  <>
                    <span className="font-doopla-mono w-14 flex-none text-center text-[16px] font-semibold text-[var(--pro-off)]">{row.dayLabel}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[var(--pro-off)]">{row.title}</span>
                      <span className="block truncate text-[12px] text-[var(--pro-tx-50)]">{row.sub}</span>
                    </span>
                  </>
                );
                return (
                  <li key={row.key} className="flex items-center gap-4 rounded-[14px] border border-[var(--pro-line)] p-3">
                    {row.bookingId ? (
                      <Link href={`/dashboard/bookings/${row.bookingId}`} className="flex min-w-0 flex-1 items-center gap-4 hover:opacity-80">
                        {info}
                        <span aria-hidden className="flex-none font-doopla-mono text-[13px] text-[var(--pro-tx-30)]">
                          ›
                        </span>
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-4">{info}</div>
                    )}
                    <span className={`font-doopla-mono inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.03em] ${AGENDA_TAG_COLOR[row.kind]}`}>
                      {row.kind === 'confirmado' ? 'Confirmado' : agendaEntryLabel[row.kind]}
                    </span>
                    {row.entryId && entry && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(row.entryId ?? null)}
                          aria-label="Editar marcação"
                          className="text-[13px] text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
                        >
                          Editar
                        </button>
                        <form action={removeAgendaEntryAction}>
                          <input type="hidden" name="id" value={row.entryId} />
                          <button type="submit" aria-label="Remover marcação" className="text-[13px] text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]">
                            ×
                          </button>
                        </form>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ProCard>
      </div>
    </main>
  );
}
