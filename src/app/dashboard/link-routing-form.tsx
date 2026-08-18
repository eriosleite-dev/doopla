'use client';

import { useActionState, useEffect, useState } from 'react';

import { updateLinkRoutingAction } from './actions';
import { eyebrowClass, ghostButtonClass } from './ui';
import type { LinkRoutingMode } from '@/lib/supabase/types';

export type BookerOption = { profileId: string; fullName: string };

const MODE_OPTIONS: { value: LinkRoutingMode; label: string; hint: string }[] = [
  {
    value: 'eu',
    label: 'Decidir caso a caso',
    hint: 'As solicitações chegam pra você primeiro — depois você escolhe, pedido por pedido, se cuida sozinha ou envia pra um booker.',
  },
  {
    value: 'meu_booker',
    label: 'Enviar automático pro meu booker',
    hint: 'As solicitações vão direto pro booker que você escolher abaixo.',
  },
  {
    value: 'eu_e_meu_booker',
    label: 'Eu e meu booker acompanhamos juntos',
    hint: 'As solicitações aparecem pra você e pro booker escolhido, os dois acompanham.',
  },
];

export function LinkRoutingForm({
  bookers,
  currentMode,
  currentBookerId,
  onSaved,
}: {
  bookers: BookerOption[];
  currentMode: LinkRoutingMode;
  currentBookerId: string | null;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateLinkRoutingAction, {});
  const [mode, setMode] = useState<LinkRoutingMode>(currentMode);
  const hasBookers = bookers.length > 0;

  useEffect(() => {
    if (state.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  if (!hasBookers) {
    return (
      <p className="text-sm text-[var(--ink)]/60">
        Você ainda não tem um booker na sua rede. Conecte um booker pra liberar esta opção.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
  );
}
