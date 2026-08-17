'use client';

import { useActionState, useState } from 'react';

import { proposeBookingAction } from '../actions';
import { cardClass, eyebrowClass, primaryButtonClass } from '../ui';

type Artist = { id: string; full_name: string };

export function ProposeForm({ artists }: { artists: Artist[] }) {
  const [state, formAction, pending] = useActionState(proposeBookingAction, {});
  const [paymentMode, setPaymentMode] = useState<'integral_apos_trabalho' | 'sinal_saldo'>(
    'integral_apos_trabalho'
  );

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

      <div className="flex flex-col gap-3 rounded-[14px] bg-[var(--paper-dim)] p-4">
        <span className={eyebrowClass}>Forma de pagamento</span>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value="integral_apos_trabalho"
              checked={paymentMode === 'integral_apos_trabalho'}
              onChange={() => setPaymentMode('integral_apos_trabalho')}
              className="h-4 w-4"
            />
            100% após o trabalho
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value="sinal_saldo"
              checked={paymentMode === 'sinal_saldo'}
              onChange={() => setPaymentMode('sinal_saldo')}
              className="h-4 w-4"
            />
            Sinal + saldo
          </label>
        </div>

        {paymentMode === 'sinal_saldo' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={eyebrowClass}>Sinal (%)</span>
              <input
                type="text"
                inputMode="decimal"
                name="depositPercentage"
                placeholder="Ex: 30"
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={eyebrowClass}>Quando vence o saldo</span>
              <input
                type="text"
                name="remainingDueRule"
                placeholder="Ex: no dia do evento"
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              />
            </label>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-[var(--ink)]/10 pt-3">
          <span className={eyebrowClass}>Política de cancelamento</span>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="clientCancellationDepositRefundable"
              defaultChecked
              className="h-4 w-4"
            />
            Se o cliente cancelar, o sinal é reembolsável
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="artistCancellationDepositRefundable"
              defaultChecked
              className="h-4 w-4"
            />
            Se o artista cancelar, o cliente tem direito ao sinal de volta
          </label>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Enviando…' : 'Enviar proposta'}
      </button>
    </form>
  );
}
