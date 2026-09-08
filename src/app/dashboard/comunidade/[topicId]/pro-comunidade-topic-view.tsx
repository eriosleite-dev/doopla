'use client';

import { useActionState, useId } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../../pro-format';
import { createReplyAction } from '../actions';

// Item 3 (08/09/2026) — o composer deixa de ser um <ProCard> flutuante
// (uma caixa separada abaixo da lista) e passa a fechar a própria
// linha do tempo: só um separador fino (border-t, mesmo tom das
// divisórias entre mensagens) indica onde a leitura termina e a
// escrita começa — sem inventar bolha de mensagem "enviada" nem
// mudar o envio real (mesma createReplyAction/RPC de sempre).
export function ProComunidadeReplyForm({ topicId }: { topicId: string }) {
  const [state, formAction, pending] = useActionState(createReplyAction.bind(null, topicId), {});
  const fieldId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-2.5 border-t border-[var(--pro-line)] pt-4">
      <label htmlFor={fieldId} className="sr-only">
        Escrever uma resposta
      </label>
      <textarea
        id={fieldId}
        name="body"
        rows={3}
        placeholder="Escreva sua resposta…"
        className={`${proInputClass} resize-y`}
        required
      />
      {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-end`}>
        {pending ? 'Enviando…' : 'Responder'}
      </button>
    </form>
  );
}
