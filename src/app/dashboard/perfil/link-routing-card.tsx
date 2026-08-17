'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { updateLinkRoutingAction } from '../actions';
import { cardClass, eyebrowClass, ghostButtonClass } from '../ui';
import type { LinkRoutingMode } from '@/lib/supabase/types';

type BookerOption = { profileId: string; fullName: string };

const MODE_OPTIONS: { value: LinkRoutingMode; label: string; hint: string }[] = [
  {
    value: 'eu',
    label: 'Só eu recebo',
    hint: 'As solicitações do seu link de orçamento chegam só pra você.',
  },
  {
    value: 'meu_booker',
    label: 'Meu booker recebe',
    hint: 'As solicitações vão direto pro booker que você escolher abaixo.',
  },
  {
    value: 'eu_e_meu_booker',
    label: 'Eu e meu booker recebemos',
    hint: 'As solicitações aparecem pra você e pro booker escolhido.',
  },
];

export function LinkRoutingCard({
  bookers,
  currentMode,
  currentBookerId,
  orcamentoUrl,
}: {
  bookers: BookerOption[];
  currentMode: LinkRoutingMode;
  currentBookerId: string | null;
  orcamentoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateLinkRoutingAction, {});
  const [mode, setMode] = useState<LinkRoutingMode>(currentMode);
  const [copied, setCopied] = useState(false);
  const hasBookers = bookers.length > 0;

  async function copyLink() {
    if (!orcamentoUrl) return;
    await navigator.clipboard.writeText(orcamentoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Seu link de orçamento</p>

      {orcamentoUrl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--ink)]/20 bg-[var(--paper-dim)] p-4">
          <span className="font-doopla-mono text-[13px] text-[var(--accent-ink)]">
            {orcamentoUrl}
          </span>
          <button type="button" onClick={copyLink} className={ghostButtonClass}>
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      )}

      <p className={`${eyebrowClass} mt-6`}>Quem recebe seus pedidos de orçamento</p>

      {!hasBookers ? (
        <p className="mt-4 text-sm text-[var(--ink)]/60">
          Você ainda não tem um booker na sua rede.{' '}
          <Link
            href="/dashboard/bookers#convites"
            className="text-[var(--accent-ink)] underline underline-offset-2"
          >
            Convide seu booker
          </Link>{' '}
          ou encontre um novo pra liberar esta opção.
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            {MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 rounded-[14px] border border-[var(--ink)]/12 p-3.5"
              >
                <input
                  type="radio"
                  name="mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-[12.5px] text-[var(--ink)]/55">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {mode !== 'eu' && (
            <label className="flex flex-col gap-1.5">
              <span className={eyebrowClass}>Booker</span>
              <select
                name="bookerId"
                defaultValue={currentBookerId ?? ''}
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              >
                <option value="" disabled>
                  Escolha um booker
                </option>
                {bookers.map((booker) => (
                  <option key={booker.profileId} value={booker.profileId}>
                    {booker.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={ghostButtonClass}>
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
