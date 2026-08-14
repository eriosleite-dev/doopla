'use client';

import { useActionState, useState } from 'react';

import { formatRelativeDate } from '@/lib/format';

import { setContractUrlAction } from '../actions';
import { contractStatus, type BookingWithOtherParty } from '../data';
import {
  accentButtonClass,
  avatarClass,
  CONTRACT_STATUS_LABELS,
  contractStatusPillClasses,
  initialsFromName,
} from '../ui';
import { GenerateContractForm } from './generate-contract-form';

type Mode = 'closed' | 'gerar' | 'anexar';

export function ContractRow({ booking }: { booking: BookingWithOtherParty }) {
  const status = contractStatus(booking);
  const [mode, setMode] = useState<Mode>('closed');
  const [state, formAction, pending] = useActionState(setContractUrlAction, {});
  const generatedByDoopla = booking.contract_url?.startsWith('/dashboard/contratos/documento/');

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <span className={avatarClass}>{initialsFromName(booking.otherPartyName)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{booking.otherPartyName}</p>
          <p className="truncate text-[12.5px] text-[var(--ink)]/55">
            {booking.description || 'Sem descrição'} · {formatRelativeDate(booking.updated_at)}
          </p>
        </div>
        <span className={contractStatusPillClasses[status]}>{CONTRACT_STATUS_LABELS[status]}</span>
      </div>

      {status === 'anexado' && booking.contract_url && (
        <a
          href={booking.contract_url}
          target={generatedByDoopla ? undefined : '_blank'}
          rel={generatedByDoopla ? undefined : 'noopener noreferrer'}
          className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
        >
          {generatedByDoopla ? 'Ver contrato gerado pela doopla' : 'Ver contrato'}
        </a>
      )}

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
