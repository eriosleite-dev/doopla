'use client';

import { useActionState, useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

import { requestPayoutAction } from '../actions';
import { accentButtonClass } from '../ui';

export function PayoutForm({ availableCents }: { availableCents: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(requestPayoutAction, {});

  if (availableCents <= 0) {
    return <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">Nada disponível pra saque ainda.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={accentButtonClass}>
        Sacar agora
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="availableCents" value={availableCents} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[.06em] text-[var(--paper)]/60">
          Valor (até {formatCentsAsBRL(availableCents)})
        </span>
        <input
          type="text"
          inputMode="decimal"
          name="amount"
          required
          defaultValue={(availableCents / 100).toFixed(2).replace('.', ',')}
          className="rounded-full border border-[var(--paper)]/25 bg-transparent px-4 py-2.5 text-sm text-[var(--paper)]"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={accentButtonClass}>
          {pending ? 'Enviando…' : 'Confirmar solicitação'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] uppercase tracking-[.06em] text-[var(--paper)]/50"
        >
          Cancelar
        </button>
      </div>
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
    </form>
  );
}
