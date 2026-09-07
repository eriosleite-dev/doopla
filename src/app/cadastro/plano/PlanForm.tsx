'use client';

import { useActionState, useEffect } from 'react';

import { TRIAL_DAYS, type PlanId } from '@/lib/market';
import { OnboardingShell } from '../OnboardingShell';
import { PlanPicker } from '../PlanPicker';
import { savePlanAction, type OnboardingFormState } from '../actions';
import '../onboarding.css';

const initialState: OnboardingFormState = {};

// modalMode/onStepComplete — mesmo mecanismo de PrepareForm.tsx: funil
// iniciado no modal da Home nunca deixa savePlanAction fazer redirect(),
// então este componente avisa o wrapper (CreateAccountModal.tsx) do
// sucesso via callback em vez de navegação automática do framework.
export function PlanForm({
  initialPlan,
  modalMode = false,
  onStepComplete,
  boxed = false,
}: {
  initialPlan: PlanId;
  modalMode?: boolean;
  onStepComplete?: () => void;
  boxed?: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePlanAction, initialState);

  useEffect(() => {
    if (modalMode && state.success) onStepComplete?.();
  }, [modalMode, state.success, onStepComplete]);

  return (
    <form action={formAction}>
      {modalMode && <input type="hidden" name="modalMode" value="1" />}
      <OnboardingShell
        step={6}
        boxed={boxed}
        footer={
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Iniciando…' : `Começar meus ${TRIAL_DAYS} dias grátis`}
          </button>
        }
      >
        <div className="ob-step">
          <div className="eyebrow">Etapa 6 de 6</div>
          <h1 className="headline">Escolha como quer começar.</h1>
          <p className="sub">{TRIAL_DAYS} dias grátis em qualquer plano, sem pedir cartão agora.</p>

          {state.error && <div className="error">{state.error}</div>}

          <PlanPicker initialPlan={initialPlan} variant="onboarding" />
        </div>
      </OnboardingShell>
    </form>
  );
}
