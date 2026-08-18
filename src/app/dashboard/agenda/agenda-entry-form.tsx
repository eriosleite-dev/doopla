'use client';

import { useActionState } from 'react';

import { addAgendaEntryAction } from '../actions';
import { accentButtonClass, eyebrowClass } from '../ui';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'indisponivel', label: 'Indisponível' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'outro', label: 'Outro compromisso' },
];

const inputClass = 'rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';

export function AgendaEntryForm({ artistProfileId }: { artistProfileId: string }) {
  const [state, formAction, pending] = useActionState(addAgendaEntryAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="artistProfileId" value={artistProfileId} />
      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Tipo</span>
        <select name="entryType" required defaultValue="" className={inputClass}>
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
        <span className={eyebrowClass}>De</span>
        <input type="date" name="startDate" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Até (opcional)</span>
        <input type="date" name="endDate" className={inputClass} />
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        <span className={eyebrowClass}>Nota (opcional)</span>
        <input
          type="text"
          name="note"
          placeholder="Ex: Viagem pra Salvador"
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={accentButtonClass}>
        {pending ? 'Salvando…' : '+ Marcar'}
      </button>
      {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
