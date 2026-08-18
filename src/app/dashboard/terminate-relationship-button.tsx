'use client';

import { useState, useTransition } from 'react';

import { terminateRepresentationAction } from './actions';

export function TerminateRelationshipButton({
  representationId,
  targetName,
}: {
  representationId: string;
  targetName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!representationId) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/40 hover:text-red-700"
      >
        Encerrar vínculo
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[var(--paper-dim)] p-3">
      <p className="text-[12px] text-[var(--ink)]/70">
        Encerrar o vínculo com {targetName}? Convites de oportunidade pendentes entre vocês
        cancelam junto, e se seu Link de Orçamento apontava pra essa pessoa, volta pra você.
        Trabalhos já em andamento continuam normalmente.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const formData = new FormData();
              formData.set('representationId', representationId);
              await terminateRepresentationAction(formData);
            })
          }
          className="font-doopla-mono rounded-full bg-red-700 px-3 py-1.5 text-[11px] uppercase tracking-[.05em] text-white"
        >
          {pending ? 'Encerrando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="font-doopla-mono rounded-full border border-[var(--line-light)] px-3 py-1.5 text-[11px] uppercase tracking-[.05em]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
