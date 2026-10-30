'use client';

import { useActionState, useEffect, useState } from 'react';

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
  // Achado da fundadora (07/10/2026): "não quero que a pessoa ache que
  // é um teste de 7 dias" — com código de beta preenchido, o CTA/
  // subtítulo não podem continuar falando em trial, já que
  // redeem_beta_code concede acesso permanente (status=active,
  // trial_ends_at=null), nunca um trial de verdade.
  const [hasBetaCode, setHasBetaCode] = useState(false);

  useEffect(() => {
    if (modalMode && state.success) onStepComplete?.();
  }, [modalMode, state.success, onStepComplete]);

  return (
    <form action={formAction}>
      {modalMode && <input type="hidden" name="modalMode" value="1" />}
      <OnboardingShell
        step={5}
        boxed={boxed}
        footer={
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Iniciando…' : hasBetaCode ? 'Resgatar acesso do Beta' : `Começar meus ${TRIAL_DAYS} dias grátis`}
          </button>
        }
      >
        <div className="ob-step">
          <div className="eyebrow">Etapa 5 de 5</div>
          <h1 className="headline">Escolha como quer começar.</h1>
          <p className="sub">
            {hasBetaCode
              ? 'Com um código de beta válido, sem cobrança e sem data pra acabar.'
              : `${TRIAL_DAYS} dias grátis em qualquer plano, sem pedir cartão agora.`}
          </p>

          {state.error && <div className="error">{state.error}</div>}

          <PlanPicker
            initialPlan={initialPlan}
            variant="onboarding"
            showVoucherField={false}
            showBetaCodeField
            onBetaCodeChange={(code) => setHasBetaCode(code.trim().length > 0)}
          />
        </div>
      </OnboardingShell>
    </form>
  );
}
