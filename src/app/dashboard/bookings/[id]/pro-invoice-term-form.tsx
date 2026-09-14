'use client';

import { useState } from 'react';

import { updateInvoiceTermAction } from '../../actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';

const PRESETS = ['À vista', '15 dias', '30 dias', '45 dias', '60 dias', '90 dias'];

// Pro re-skin (Bloco 7, P1) de InvoiceTermForm — mesma action/lógica,
// só o tema --pro-*.
export function ProInvoiceTermForm({
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
      <button type="button" onClick={() => setOpen(true)} className={`${proGhostButtonClass} self-start`}>
        {currentTerm ? 'Atualizar prazo' : 'Informar prazo de pagamento'}
      </button>
    );
  }

  return (
    <form
      action={updateInvoiceTermAction}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-end gap-3 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] p-3.5"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="flex flex-col gap-1">
        <span className={proLabelClass}>Prazo de pagamento</span>
        <select value={choice} onChange={(e) => setChoice(e.target.value)} className={proInputClass}>
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
        className={`min-w-[160px] ${proInputClass} read-only:opacity-60`}
      />
      <button type="submit" className={proPrimaryButtonClass}>
        Salvar
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-pro-sub text-[12px] font-bold text-[var(--pro-tx-50)] underline hover:text-[var(--pro-off)]"
      >
        Cancelar
      </button>
    </form>
  );
}
