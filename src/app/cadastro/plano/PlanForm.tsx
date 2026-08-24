'use client';

import { useActionState } from 'react';

import { TRIAL_DAYS, type PlanId } from '@/lib/market';
import { OnboardingShell } from '../OnboardingShell';
import { PlanPicker } from '../PlanPicker';
import { savePlanAction, type OnboardingFormState } from '../actions';
import '../onboarding.css';

const initialState: OnboardingFormState = {};

export function PlanForm({ initialPlan }: { initialPlan: PlanId }) {
  const [state, formAction, pending] = useActionState(savePlanAction, initialState);

  return (
    <form action={formAction}>
      <OnboardingShell
        step={7}
        footer={
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Iniciando…' : `Começar meus ${TRIAL_DAYS} dias grátis`}
          </button>
        }
      >
        <div className="ob-step">
          <div className="eyebrow">Etapa 7 de 7</div>
          <h1 className="headline">
            Escolha como <em>quer começar.</em>
          </h1>
          <p className="sub">{TRIAL_DAYS} dias grátis em qualquer plano, sem pedir cartão agora.</p>

          {state.error && <div className="error">{state.error}</div>}

          <PlanPicker initialPlan={initialPlan} variant="onboarding" />
        </div>
      </OnboardingShell>
    </form>
  );
}
