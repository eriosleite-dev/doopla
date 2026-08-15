'use client';

import { useActionState, useState } from 'react';

import { setContractUrlAction } from '../../actions';
import { GenerateContractForm } from '../../contratos/generate-contract-form';
import { contractStatus, type BookingWithOtherParty } from '../../data';
import { accentButtonClass, CONTRACT_STATUS_LABELS, contractStatusPillClasses } from '../../ui';

type Mode = 'closed' | 'gerar' | 'anexar';

export function ContractSection({ booking }: { booking: BookingWithOtherParty }) {
  const status = contractStatus(booking);
  const [mode, setMode] = useState<Mode>('closed');
  const [state, formAction, pending] = useActionState(setContractUrlAction, {});
  const generatedByDoopla = booking.contract_url?.startsWith('/dashboard/contratos/documento/');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={contractStatusPillClasses[status]}>{CONTRACT_STATUS_LABELS[status]}</span>
        {status === 'anexado' && booking.contract_url && (
          <a
            href={booking.contract_url}
            target={generatedByDoopla ? undefined : '_blank'}
            rel={generatedByDoopla ? undefined : 'noopener noreferrer'}
            className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
          >
            {generatedByDoopla ? 'Ver contrato gerado pela doopla' : 'Ver contrato'}
          </a>
        )}
      </div>

      {mode === 'closed' && (
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setMode('gerar')}
            className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 underline hover:text-[var(--ink)]"
          >
            Gerar contrato com a doopla
          </button>
          <button
            type="button"
            onClick={() => setMode('anexar')}
            className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 underline hover:text-[var(--ink)]"
          >
            {status === 'anexado' ? 'Trocar link' : 'Anexar contrato próprio'}
          </button>
        </div>
      )}

      {mode === 'gerar' && (
        <GenerateContractForm booking={booking} onCancel={() => setMode('closed')} />
      )}

      {mode === 'anexar' && (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="bookingId" value={booking.id} />
          <input
            type="url"
            name="contractUrl"
            required
            placeholder="https://..."
            className="min-w-0 flex-1 rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2 text-sm"
          />
          <button type="submit" disabled={pending} className={accentButtonClass}>
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => setMode('closed')}
            className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50"
          >
            Cancelar
          </button>
          {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
