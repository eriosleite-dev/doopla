'use client';

import { useActionState } from 'react';

import { submitOrcamentoRequestAction } from './actions';

export function OrcamentoForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(submitOrcamentoRequestAction, {});

  if (state.success) {
    return (
      <div className="rounded-[18px] bg-[var(--musgo)]/10 p-6 text-center">
        <p className="font-doopla-display text-xl font-semibold text-[var(--musgo)]">
          Solicitação enviada ✓
        </p>
        <p className="mt-2 text-sm text-[var(--ink)]/70">
          Recebemos seu pedido. Você será contatado em breve.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <label className="flex flex-col gap-1.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Seu nome
        </span>
        <input
          type="text"
          name="clientName"
          required
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Telefone ou e-mail
        </span>
        <input
          type="text"
          name="clientContact"
          required
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Conte sobre o evento
        </span>
        <textarea
          name="description"
          rows={3}
          placeholder="Ex: casamento, 20 pessoas, precisa de DJ das 20h às 2h"
          className="rounded-[18px] border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
            Data do evento (opcional)
          </span>
          <input
            type="date"
            name="eventDate"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
            Local (opcional)
          </span>
          <input
            type="text"
            name="location"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/55">
          Valor que você pode oferecer (opcional)
        </span>
        <input
          type="text"
          inputMode="decimal"
          name="offeredAmount"
          placeholder="Deixe em branco se ainda não sabe"
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        />
      </label>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="font-doopla-mono rounded-full bg-[var(--ink)] px-5 py-3.5 text-center text-[13.5px] font-semibold text-[var(--paper)]"
      >
        {pending ? 'Enviando…' : 'Enviar solicitação'}
      </button>
    </form>
  );
}
