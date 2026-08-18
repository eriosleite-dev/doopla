'use client';

import { useActionState, useState } from 'react';

import type { BookerCard } from '../data';
import { publishOpportunityAction } from '../actions';
import { cardClass, eyebrowClass, primaryButtonClass } from '../ui';

export function PublishForm({ myBookers }: { myBookers: BookerCard[] }) {
  const [state, formAction, pending] = useActionState(publishOpportunityAction, {});
  const [openToNew, setOpenToNew] = useState(true);
  const [sendToMine, setSendToMine] = useState(myBookers.length > 0);
  const [selectedBookerIds, setSelectedBookerIds] = useState<string[]>(myBookers.map((b) => b.profileId));

  function toggleBooker(id: string) {
    setSelectedBookerIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  }

  const chosenBookers = myBookers.filter((b) => selectedBookerIds.includes(b.profileId));
  const canSubmit = openToNew || (sendToMine && chosenBookers.length > 0);

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

      <div className="flex flex-col gap-3">
        <span className={eyebrowClass}>Quem pode receber essa oportunidade?</span>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[var(--ink)]/15 px-4 py-3">
          <input
            type="checkbox"
            checked={openToNew}
            onChange={(e) => setOpenToNew(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium">Abrir para novos bookers</span>
            <span className="block text-[12px] text-[var(--ink)]/55">
              Bookers da doopla poderão demonstrar interesse.
            </span>
          </span>
        </label>

        {myBookers.length === 1 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[var(--ink)]/15 px-4 py-3">
            <input
              type="checkbox"
              checked={sendToMine}
              onChange={(e) => setSendToMine(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm font-medium">
              Enviar para meu booker — {myBookers[0].fullName}
            </span>
          </label>
        )}

        {myBookers.length > 1 && (
          <>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[var(--ink)]/15 px-4 py-3">
              <input
                type="checkbox"
                checked={sendToMine}
                onChange={(e) => setSendToMine(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Enviar para meus bookers</span>
                <span className="block text-[12px] text-[var(--ink)]/55">
                  Envie diretamente pra um ou mais bookers que já trabalham com você.
                </span>
              </span>
            </label>

            {sendToMine && (
              <div className="flex flex-col gap-2 rounded-[14px] bg-[var(--paper-dim)] p-4">
                <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
                  Pra quais bookers?
                </span>
                <div className="flex flex-col gap-1.5">
                  {myBookers.map((b) => (
                    <label key={b.profileId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedBookerIds.includes(b.profileId)}
                        onChange={() => toggleBooker(b.profileId)}
                      />
                      {b.fullName}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-[14px] border border-dashed border-[var(--ink)]/20 p-4 text-[13px]">
        <p className="font-doopla-mono mb-1.5 text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
          Essa oportunidade será
        </p>
        <ul className="flex flex-col gap-1 text-[var(--ink)]/75">
          {openToNew && <li>✓ Aberta para novos bookers</li>}
          {sendToMine && chosenBookers.length > 0 && (
            <li>✓ Enviada diretamente para {chosenBookers.map((b) => b.fullName).join(', ')}</li>
          )}
          {!canSubmit && <li className="text-red-700">Escolha pelo menos uma opção acima.</li>}
        </ul>
      </div>

      <input type="hidden" name="openToNew" value={openToNew ? '1' : ''} />
      {sendToMine && chosenBookers.map((b) => (
        <input key={b.profileId} type="hidden" name="directBookerIds" value={b.profileId} />
      ))}

      <p className="text-[12.5px] text-[var(--ink)]/50">
        Deixando o cachê em branco, o mural mostra &ldquo;cachê ainda não fechado&rdquo; e só a
        comissão.
      </p>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <button type="submit" disabled={pending || !canSubmit} className={primaryButtonClass}>
        {pending ? 'Publicando…' : 'Publicar'}
      </button>
    </form>
  );
}
