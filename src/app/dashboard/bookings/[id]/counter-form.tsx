'use client';

import { useActionState, useState } from 'react';

import { counterBookingAction } from '../../actions';
import { accentButtonClass, rustGhostButtonClass } from '../../ui';

export function CounterForm({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(counterBookingAction, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={rustGhostButtonClass}>
        Contrapropor
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Nova comissão (%)
        </span>
        <input
          type="text"
          inputMode="decimal"
          name="commissionPercent"
          required
          className="w-28 rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
          placeholder="Ex: 15"
        />
      </label>
      <button type="submit" disabled={pending} className={accentButtonClass}>
        {pending ? 'Enviando…' : 'Enviar contraproposta'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 underline"
      >
        Cancelar
      </button>
      {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
