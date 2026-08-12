'use client';

import { useActionState } from 'react';

import { publishOpportunityAction } from '../actions';
import { cardClass, eyebrowClass, primaryButtonClass } from '../ui';

export function PublishForm() {
  const [state, formAction, pending] = useActionState(publishOpportunityAction, {});

  return (
    <form action={formAction} className={`${cardClass} flex flex-col gap-5`}>
      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Descrição do trabalho</span>
        <textarea
          name="description"
          rows={3}
          required
          className="rounded-[18px] border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          placeholder="Ex: show de 1h num casamento, 14/12, precisa de booker pra fechar"
        />
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Comissão oferecida (%)</span>
          <input
            type="text"
            inputMode="decimal"
            name="commissionPercent"
            required
            placeholder="Ex: 15"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Cachê (R$, opcional)</span>
          <input
            type="text"
            inputMode="decimal"
            name="cacheAmountCents"
            placeholder="Deixe em branco se ainda está em aberto"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
      </div>
      <p className="text-[12.5px] text-[var(--ink)]/50">
        Deixando o cachê em branco, o mural mostra &ldquo;cachê ainda não fechado&rdquo; e só a
        comissão.
      </p>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Publicando…' : 'Publicar no mural'}
      </button>
    </form>
  );
}
