'use client';

import { useActionState } from 'react';

import { addAgendaEntryAction } from '../actions';
import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../pro-format';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'indisponivel', label: 'Indisponível' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'outro', label: 'Outro compromisso' },
];

// Re-skin de AgendaEntryForm (item 8 da revisão Professional Web
// Dashboard, 06/09/2026) — mesma Server Action (addAgendaEntryAction,
// CRUD de agenda_entries intocado), só a pele muda. A versão legada
// (agenda-entry-form.tsx) continua servindo o fluxo do Booker
// (marcação na agenda de cada artista representado).
export function ProAgendaEntryForm({ artistProfileId }: { artistProfileId: string }) {
  const [state, formAction, pending] = useActionState(addAgendaEntryAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="artistProfileId" value={artistProfileId} />
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Tipo</span>
        <select name="entryType" required defaultValue="" className={proInputClass}>
          <option value="" disabled>
            Escolha
          </option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>De</span>
        <input type="date" name="startDate" required className={proInputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Até (opcional)</span>
        <input type="date" name="endDate" className={proInputClass} />
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        <span className={proLabelClass}>Nota (opcional)</span>
        <input type="text" name="note" placeholder="Ex: Viagem pra Salvador" className={proInputClass} />
      </label>
      <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
        {pending ? 'Salvando…' : '+ Marcar'}
      </button>
      {state.error && <p className="w-full text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
    </form>
  );
}
