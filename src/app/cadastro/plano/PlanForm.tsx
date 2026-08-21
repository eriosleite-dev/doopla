'use client';

import { useActionState } from 'react';

import { primaryButtonClass } from '@/app/auth/ui';
import { TRIAL_DAYS, type PlanId } from '@/lib/market';
import { PlanPicker } from '../PlanPicker';
import { savePlanAction, type OnboardingFormState } from '../actions';

const initialState: OnboardingFormState = {};

export function PlanForm({ initialPlan }: { initialPlan: PlanId }) {
  const [state, formAction, pending] = useActionState(savePlanAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <PlanPicker initialPlan={initialPlan} />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Iniciando…' : `Iniciar ${TRIAL_DAYS} dias grátis`}
      </button>
    </form>
  );
}
