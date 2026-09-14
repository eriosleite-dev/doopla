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
//
// Correção de grid/alinhamento (06/09/2026): este form precisa ocupar
// as DUAS colunas do mesmo grid que Calendário/Eventos usam embaixo —
// "Tipo+De+Até" alinhado à largura do Calendário, "Nota+Marcar"
// alinhado à largura de Eventos, mesmo gap horizontal. `className="contents"`
// no <form> tira o form do fluxo de layout (sem caixa própria) sem tirar
// sua função de agrupar os campos pro submit — os 2 divs abaixo viram
// item de grid DIRETO do grid pai (pro-agenda-view.tsx), nunca uma
// largura calculada à parte. Quem monta o grid de verdade é o
// componente pai — este form só entrega os itens certos pra ele.
export function ProAgendaEntryForm({ artistProfileId }: { artistProfileId: string }) {
  const [state, formAction, pending] = useActionState(addAgendaEntryAction, {});

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="artistProfileId" value={artistProfileId} />
      <div className="flex flex-wrap items-end gap-3">
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
        <label className="flex flex-1 flex-col gap-1.5">
          <span className={proLabelClass}>De</span>
          <input type="date" name="startDate" required className={proInputClass} />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className={proLabelClass}>Até (opcional)</span>
          <input type="date" name="endDate" className={proInputClass} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <span className={proLabelClass}>Nota (opcional)</span>
          <input type="text" name="note" placeholder="Ex: Viagem pra Salvador" className={proInputClass} />
        </label>
        <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
          {pending ? 'Salvando…' : '+ Marcar'}
        </button>
      </div>
      {state.error && <p className="text-[12.5px] text-[var(--pro-red)] lg:col-span-2">{state.error}</p>}
    </form>
  );
}
