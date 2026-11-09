'use client';

import { useActionState, useState } from 'react';

import { proposeRescheduleAction, respondRescheduleAction } from '../../actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
}

// Pro re-skin (Bloco 7, P1) de RescheduleForm — mesma action/lógica,
// só o tema --pro-*.
export function ProRescheduleForm({
  bookingId,
  role,
  eventDate,
  proposedDate,
  isProposer,
}: {
  bookingId: string;
  role: 'artista' | 'booker' | 'agencia';
  eventDate: string | null;
  proposedDate: string | null;
  isProposer: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(proposeRescheduleAction, {});

  if (proposedDate) {
    if (role === 'artista' && !isProposer) {
      return (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4">
          <p className="text-sm text-[var(--pro-tx-70)]">
            Remarcação proposta para {formatDate(proposedDate)}.
          </p>
          <div className="flex items-center gap-3">
            <form action={respondRescheduleAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="decision" value="aceitar" />
              <button type="submit" className={proPrimaryButtonClass}>
                Aceitar nova data
              </button>
            </form>
            <form action={respondRescheduleAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="decision" value="recusar" />
              <button type="submit" className={proGhostButtonClass}>
                Recusar
              </button>
            </form>
          </div>
        </div>
      );
    }
    return (
      <p className="text-sm text-[var(--pro-tx-50)]">
        Remarcação pra {formatDate(proposedDate)} proposta, aguardando o artista aceitar.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={proGhostButtonClass}>
        Propor remarcação
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1.5">
        <span className={proLabelClass}>Nova data</span>
        <input type="date" name="newDate" required defaultValue={eventDate ?? ''} className={proInputClass} />
      </label>
      {state.error && <p className="text-sm text-[#ff8b80]">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proGhostButtonClass}>
          {pending ? 'Enviando…' : role === 'artista' ? 'Confirmar nova data' : 'Propor nova data'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={proGhostButtonClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
