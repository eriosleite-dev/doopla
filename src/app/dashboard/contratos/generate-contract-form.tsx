'use client';

import { useActionState } from 'react';

import { generateContractAction } from '../actions';
import type { BookingWithOtherParty } from '../data';
import { accentButtonClass } from '../ui';

export function GenerateContractForm({
  booking,
  onCancel,
}: {
  booking: BookingWithOtherParty;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(generateContractAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-2.5 rounded-[14px] bg-[var(--paper-dim)] p-4">
      <input type="hidden" name="bookingId" value={booking.id} />
      <p className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
        Gerar contrato com a doopla
      </p>
      <input
        type="text"
        name="clientName"
        required
        defaultValue={booking.client_name ?? ''}
        placeholder="Nome do contratante (cliente)"
        className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
      />
      <input
        type="text"
        name="clientDocument"
        defaultValue={booking.client_document ?? ''}
        placeholder="CPF/CNPJ do contratante (opcional)"
        className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
      />
      <input
        type="text"
        name="eventLocation"
        defaultValue={booking.event_location ?? ''}
        placeholder="Local do evento (opcional)"
        className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
      />
      <label className="flex flex-col gap-1 text-[12px] text-[var(--ink)]/55">
        Data do evento
        <input
          type="date"
          name="eventDate"
          required
          defaultValue={booking.event_date ?? ''}
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm text-[var(--ink)]"
        />
      </label>
      <p className="text-[11px] text-[var(--ink)]/45">
        Cobre escopo, partes e evento. Pagamento e cancelamento ainda não entram — dependem da
        validação jurídica em andamento.
      </p>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={accentButtonClass}>
          {pending ? 'Gerando…' : 'Gerar contrato'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
