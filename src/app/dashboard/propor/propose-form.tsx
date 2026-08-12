'use client';

import { useActionState } from 'react';

import { proposeBookingAction } from '../actions';
import { cardClass, eyebrowClass, primaryButtonClass } from '../ui';

type Artist = { id: string; full_name: string };

export function ProposeForm({ artists }: { artists: Artist[] }) {
  const [state, formAction, pending] = useActionState(proposeBookingAction, {});

  return (
    <form action={formAction} className={`${cardClass} flex flex-col gap-5`}>
      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Artista</span>
        <select
          name="artistProfileId"
          required
          defaultValue=""
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        >
          <option value="" disabled>
            Selecione um artista que você representa
          </option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id}>
              {artist.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Descrição do trabalho</span>
        <textarea
          name="description"
          rows={3}
          className="rounded-[18px] border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          placeholder="Ex: show privado, 2h, 20/09"
        />
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={eyebrowClass}>Comissão proposta (%)</span>
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
            placeholder="Deixe em branco se ainda não fechou"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={eyebrowClass}>Data do trabalho (opcional)</span>
        <input
          type="date"
          name="eventDate"
          className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-3 text-sm"
        />
      </label>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Enviando…' : 'Enviar proposta'}
      </button>
    </form>
  );
}
