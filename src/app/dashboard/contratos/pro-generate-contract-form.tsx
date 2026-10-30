'use client';

import { useActionState } from 'react';

import { generateContractAction } from '../actions';
import type { BookingWithOtherParty } from '../data';
import { proInputClass, proPrimaryButtonClass } from '../pro-format';

// Pro re-skin (Bloco 7, P1) de GenerateContractForm — mesma
// action/lógica, só o tema --pro-*. Usado só a partir de
// pro-contract-section.tsx (booking detail do artista/agência).
export function ProGenerateContractForm({
  booking,
  onCancel,
}: {
  booking: BookingWithOtherParty;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(generateContractAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4">
      <input type="hidden" name="bookingId" value={booking.id} />
      <p className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)]">
        Gerar contrato com a doopla
      </p>
      <input
        type="text"
        name="clientName"
        required
        defaultValue={booking.client_name ?? ''}
        placeholder="Nome do contratante (cliente)"
        className={proInputClass}
      />
      <input
        type="text"
        name="clientDocument"
        defaultValue={booking.client_document ?? ''}
        placeholder="CPF/CNPJ do contratante (opcional)"
        className={proInputClass}
      />
      <input
        type="text"
        name="eventLocation"
        defaultValue={booking.event_location ?? ''}
        placeholder="Local do evento (opcional)"
        className={proInputClass}
      />
      <label className="flex flex-col gap-1 text-[12px] text-[var(--pro-tx-50)]">
        Data do evento
        <input type="date" name="eventDate" required defaultValue={booking.event_date ?? ''} className={proInputClass} />
      </label>
      <p className="text-[11px] text-[var(--pro-tx-30)]">
        Cobre escopo, partes e evento. Pagamento e cancelamento ainda não entram — dependem da
        validação jurídica em andamento.
      </p>
      {state.error && <p className="text-sm text-[#ff8b80]">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proPrimaryButtonClass}>
          {pending ? 'Gerando…' : 'Gerar contrato'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
