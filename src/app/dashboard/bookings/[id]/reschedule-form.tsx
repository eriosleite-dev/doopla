'use client';

import { useActionState, useState } from 'react';

import { proposeRescheduleAction, respondRescheduleAction } from '../../actions';
import { eyebrowClass, ghostButtonClass, primaryButtonClass } from '../../ui';

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');
}

export function RescheduleForm({
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
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--accent-ink)]/25 p-4">
          <p className="text-sm text-[var(--ink)]/70">
            Remarcação proposta para {formatDate(proposedDate)}.
          </p>
          <div className="flex items-center gap-3">
            <form action={respondRescheduleAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="decision" value="aceitar" />
              <button type="submit" className={primaryButtonClass}>
                Aceitar nova data
              </button>
            </form>
            <form action={respondRescheduleAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="decision" value="recusar" />
              <button type="submit" className={ghostButtonClass}>
                Recusar
              </button>
            </form>
          </div>
        </div>
      );
    }
    return (
      <p className="text-sm text-[var(--ink)]/60">
        Remarcação pra {formatDate(proposedDate)} proposta, aguardando o artista aceitar.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ghostButtonClass}>
        Propor remarcação
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Nova data</span>
        <input
          type="date"
          name="newDate"
          required
          defaultValue={eventDate ?? ''}
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
        />
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={ghostButtonClass}>
          {pending
            ? 'Enviando…'
            : role === 'artista'
              ? 'Confirmar nova data'
              : 'Propor nova data'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
