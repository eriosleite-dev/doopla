'use client';

import { useActionState, useState } from 'react';

import { cancelBookingAction } from '../../actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

// Pro re-skin (Bloco 7, P1) de CancelBookingForm — mesma action/lógica,
// só o tema --pro-*. Ver cancel-booking-form.tsx (legado, Booker) pra
// comparação lado a lado.
export function ProCancelBookingForm({
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
      <button type="button" onClick={() => setOpen(true)} className={proGhostButtonClass}>
        Cancelar booking
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-[14px] border border-[#ff8b80]/25 bg-[rgba(226,41,28,.06)] p-4">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="text-[12.5px] text-[var(--pro-tx-70)]">
        <p className={proLabelClass}>O que a política diz</p>
        <ul className="mt-2 flex flex-col gap-1">
          {policyLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-[var(--pro-tx-50)]">
          O cancelamento fica registrado. A execução de qualquer reembolso ainda depende da
          integração real de pagamento.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Quem está cancelando</span>
        <select name="initiator" required defaultValue="" className={proInputClass}>
          <option value="" disabled>
            Selecione
          </option>
          <option value="cliente">O cliente desistiu</option>
          <option value="artista">Eu (artista) estou cancelando</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Motivo (opcional)</span>
        <textarea name="reason" rows={2} className={proInputClass} />
      </label>

      {state.error && <p className="text-sm text-[#ff8b80]">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
          {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={proGhostButtonClass}>
          Voltar
        </button>
      </div>
    </form>
  );
}
