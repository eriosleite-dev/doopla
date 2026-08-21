'use client';

import { useActionState } from 'react';

import { fieldInputClass, fieldLabelClass, primaryButtonClass } from '@/app/auth/ui';
import { savePrepareAction, type OnboardingFormState } from '../actions';

const initialState: OnboardingFormState = {};

export function PrepareForm({
  initialStageName,
  initialBio,
  initialLocal,
}: {
  initialStageName: string;
  initialBio: string;
  initialLocal: string;
}) {
  const [state, formAction, pending] = useActionState(savePrepareAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Nome artístico</span>
        <input
          type="text"
          name="stageName"
          required
          defaultValue={initialStageName}
          className={fieldInputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Fale sobre o seu trabalho. O que você faz?</span>
        <textarea
          name="bio"
          required
          rows={4}
          defaultValue={initialBio}
          placeholder="Ex: Sou fotógrafa de moda e também faço campanhas para marcas."
          className={fieldInputClass}
        />
        <span className="text-xs text-[var(--ink)]/50">
          Conte do seu jeito. Sua Doopla usa isso para entender seu trabalho e as oportunidades
          que chegam até você.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Em qual cidade e estado você está baseado?</span>
        <input
          type="text"
          name="local"
          defaultValue={initialLocal}
          placeholder="Ex: São Paulo, SP"
          className={fieldInputClass}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Salvando…' : 'Continuar'}
      </button>
    </form>
  );
}
