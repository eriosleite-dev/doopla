'use client';

import { useActionState, useState } from 'react';

import { counterBookingAction } from '../../actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

// Pro re-skin (Bloco 7, P1) de CounterForm — mesma action/lógica, só o
// tema --pro-*.
export function ProCounterForm({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(counterBookingAction, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={proGhostButtonClass}>
        Contrapropor
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1">
        <span className={proLabelClass}>Nova comissão (%)</span>
        <input
          type="text"
          inputMode="decimal"
          name="commissionPercent"
          required
          className={`w-28 ${proInputClass}`}
          placeholder="Ex: 15"
        />
      </label>
      <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
        {pending ? 'Enviando…' : 'Enviar contraproposta'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="font-pro-sub text-[12px] font-bold text-[var(--pro-tx-50)] underline hover:text-[var(--pro-off)]">
        Cancelar
      </button>
      {state.error && <p className="w-full text-sm text-[#ff8b80]">{state.error}</p>}
    </form>
  );
}
