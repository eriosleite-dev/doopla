'use client';

import { useActionState } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { createReplyAction } from '../actions';

export function ProComunidadeReplyForm({ topicId }: { topicId: string }) {
  const [state, formAction, pending] = useActionState(createReplyAction.bind(null, topicId), {});

  return (
    <ProCard>
      <form action={formAction} className="flex flex-col gap-3">
        <textarea
          name="body"
          rows={3}
          placeholder="Escreva sua resposta…"
          className={`${proInputClass} resize-y`}
          required
        />
        {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}
        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Enviando…' : 'Responder'}
        </button>
      </form>
    </ProCard>
  );
}
