'use client';

import { useState } from 'react';

import { updateInvoiceTermAction } from '../../actions';
import { ghostButtonClass, primaryButtonClass } from '../../ui';

const PRESETS = ['À vista', '15 dias', '30 dias', '45 dias', '60 dias', '90 dias'];

export function InvoiceTermForm({
  bookingId,
  currentTerm,
}: {
  bookingId: string;
  currentTerm: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isPreset = currentTerm != null && PRESETS.includes(currentTerm);
  const [choice, setChoice] = useState(isPreset ? currentTerm! : currentTerm ? 'outro' : 'À vista');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${ghostButtonClass} self-start`}>
        {currentTerm ? 'Atualizar prazo' : 'Informar prazo de pagamento'}
      </button>
    );
  }

  return (
    <form
      action={updateInvoiceTermAction}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-end gap-3 rounded-[12px] bg-white p-3.5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Prazo de pagamento
        </span>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="outro">Outro</option>
        </select>
      </label>
      <input
        type="text"
        name="invoicePaymentTerm"
        defaultValue={choice === 'outro' ? (isPreset ? '' : currentTerm ?? '') : choice}
        key={choice}
        placeholder={choice === 'outro' ? 'Ex: 30 dias após emissão da NF' : undefined}
        readOnly={choice !== 'outro'}
        className="min-w-[160px] rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm read-only:bg-[var(--paper-dim)]"
      />
      <button type="submit" className={primaryButtonClass}>
        Salvar
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 underline"
      >
        Cancelar
      </button>
    </form>
  );
}
