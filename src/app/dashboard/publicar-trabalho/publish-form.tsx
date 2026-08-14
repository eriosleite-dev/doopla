'use client';

import { useActionState, useState } from 'react';

import { publishOpportunityAction } from '../actions';
import { cardClass, eyebrowClass, primaryButtonClass } from '../ui';

const DISTRIBUTION_OPTIONS = [
  { value: 'ambos', label: 'Meus bookers + novos bookers', hint: 'Os dois caminhos em paralelo, até alguém ser escolhido.' },
  { value: 'meus_bookers', label: 'Só meus bookers', hint: 'Você convida diretamente quem já representa você.' },
  { value: 'novos_bookers', label: 'Só novos bookers', hint: 'Fica aberto pra qualquer booker da doopla demonstrar interesse.' },
] as const;

export function PublishForm() {
  const [state, formAction, pending] = useActionState(publishOpportunityAction, {});
  const [distributionMode, setDistributionMode] = useState<(typeof DISTRIBUTION_OPTIONS)[number]['value']>('ambos');

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Categoria (opcional)</span>
          <input
            type="text"
            name="category"
            placeholder="Ex: casamento, festa corporativa"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Local (opcional)</span>
          <input
            type="text"
            name="location"
            placeholder="Ex: São Paulo, SP"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Data do evento (opcional)</span>
          <input
            type="date"
            name="eventDate"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className={eyebrowClass}>Pra quem essa oportunidade vai</span>
        <div className="flex flex-col gap-2">
          {DISTRIBUTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-[14px] border px-4 py-3 ${
                distributionMode === opt.value
                  ? 'border-[var(--accent)] bg-[var(--accent)]/8'
                  : 'border-[var(--ink)]/15'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="distributionMode"
                  value={opt.value}
                  checked={distributionMode === opt.value}
                  onChange={() => setDistributionMode(opt.value)}
                />
                {opt.label}
              </span>
              <span className="pl-6 text-[12px] text-[var(--ink)]/55">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <p className="text-[12.5px] text-[var(--ink)]/50">
        Deixando o cachê em branco, o mural mostra &ldquo;cachê ainda não fechado&rdquo; e só a
        comissão.
      </p>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Publicando…' : 'Publicar'}
      </button>
    </form>
  );
}
