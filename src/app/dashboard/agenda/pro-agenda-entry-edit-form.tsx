'use client';

import { useActionState } from 'react';

import { updateAgendaEntryAction } from '../actions';
import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../pro-format';
import type { AgendaEntryType } from '@/lib/supabase/types';

const TYPE_OPTIONS: { value: AgendaEntryType; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'indisponivel', label: 'Indisponível' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'outro', label: 'Outro compromisso' },
];

// Edição inline de uma marcação já existente (30/09/2026, achado real
// de QA: "vou voltar 2 dias antes e quero liberar esses dois dias" —
// antes só dava excluir a marcação inteira e recriar). Mesmo padrão
// visual de ProAgendaEntryForm (criação), só que preenchido com os
// valores atuais e chamando updateAgendaEntryAction (muda o registro
// por id) em vez de criar um novo. Renderizado no lugar da linha
// normal quando "Editar" é clicado (ver pro-agenda-view.tsx) — cancelar
// volta pra exibição normal sem salvar nada.
export function ProAgendaEntryEditForm({
  entryId,
  initialType,
  initialStartDate,
  initialEndDate,
  initialNote,
  onCancel,
}: {
  entryId: string;
  initialType: AgendaEntryType;
  initialStartDate: string;
  initialEndDate: string;
  initialNote: string;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateAgendaEntryAction, {});

  return (
    <form action={formAction} className="flex flex-1 flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={entryId} />
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Tipo</span>
        <select name="entryType" required defaultValue={initialType} className={proInputClass}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1.5">
        <span className={proLabelClass}>De</span>
        <input type="date" name="startDate" required defaultValue={initialStartDate} className={proInputClass} />
      </label>
      <label className="flex flex-1 flex-col gap-1.5">
        <span className={proLabelClass}>Até</span>
        <input type="date" name="endDate" defaultValue={initialEndDate} className={proInputClass} />
      </label>
      <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
        <span className={proLabelClass}>Nota</span>
        <input type="text" name="note" defaultValue={initialNote} placeholder="Ex: Férias" className={proInputClass} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
        >
          Cancelar
        </button>
      </div>
      {state.error && <p className="w-full text-[12.5px] text-[var(--pro-red)]">{state.error}</p>}
    </form>
  );
}
