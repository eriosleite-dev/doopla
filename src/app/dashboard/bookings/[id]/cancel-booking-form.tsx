'use client';

import { useActionState, useState } from 'react';

import { cancelBookingAction } from '../../actions';
import { eyebrowClass, ghostButtonClass, rustGhostButtonClass } from '../../ui';

export function CancelBookingForm({
  bookingId,
  policyLines,
}: {
  bookingId: string;
  policyLines: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(cancelBookingAction, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={rustGhostButtonClass}>
        Cancelar booking
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-[14px] border border-[var(--alert)]/25 p-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="text-[12.5px] text-[var(--ink)]/70">
        <p className={eyebrowClass}>O que a política diz</p>
        <ul className="mt-2 flex flex-col gap-1">
          {policyLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-[var(--ink)]/50">
          O cancelamento fica registrado. A execução de qualquer reembolso ainda depende da
          integração real de pagamento.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Quem está cancelando</span>
        <select
          name="initiator"
          required
          defaultValue=""
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
        >
          <option value="" disabled>
            Selecione
          </option>
          <option value="cliente">O cliente desistiu</option>
          <option value="artista">Eu (artista) estou cancelando</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Motivo (opcional)</span>
        <textarea
          name="reason"
          rows={2}
          className="rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
        />
      </label>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="font-doopla-mono rounded-full bg-[var(--alert)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
          Voltar
        </button>
      </div>
    </form>
  );
}
