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

export function ContractRow({ booking }: { booking: BookingWithOtherParty }) {
  const status = contractStatus(booking);
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setContractUrlAction, {});

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
          target="_blank"
          rel="noopener noreferrer"
          className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
        >
          Ver contrato
        </a>
      )}

      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-doopla-mono w-fit text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 underline hover:text-[var(--ink)]"
        >
          {status === 'anexado' ? 'Trocar link' : 'Anexar contrato'}
        </button>
      )}

      {editing && (
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
            onClick={() => setEditing(false)}
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
