'use client';

import { useActionState, useState } from 'react';

import { requestRepresentationAction } from '../actions';
import type { RepresentationRequestStatus } from '@/lib/supabase/types';
import { accentButtonClass, ghostButtonClass } from '../ui';

const STATUS_LABEL: Record<RepresentationRequestStatus, string> = {
  pendente: 'Solicitação enviada ✓',
  aceita: 'Já representa ✓',
  recusada: 'Solicitação recusada',
  expirada: 'Solicitação expirada',
};

export function RequestRepresentationButton({
  artistProfileId,
  status,
}: {
  artistProfileId: string;
  status: RepresentationRequestStatus | null;
}) {
  const [state, formAction, pending] = useActionState(requestRepresentationAction, {});
  const [open, setOpen] = useState(false);

  if (status === 'pendente' || status === 'aceita') {
    return (
      <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/45">
        {STATUS_LABEL[status]}
      </span>
    );
  }

  if (open) {
    return (
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="targetProfileId" value={artistProfileId} />
        <textarea
          name="message"
          placeholder="Mensagem opcional pro artista"
          rows={2}
          className="rounded-[12px] border border-[var(--line-light)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
        />
        {state.error && <p className="text-[12px] text-red-700">{state.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={accentButtonClass}>
            {pending ? 'Enviando…' : 'Enviar solicitação'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={ghostButtonClass}>
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)} className={ghostButtonClass}>
      {status === 'recusada' || status === 'expirada'
        ? 'Enviar nova solicitação'
        : 'Quero representar este artista'}
    </button>
  );
}
