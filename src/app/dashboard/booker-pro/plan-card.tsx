'use client';

import { useActionState } from 'react';

import type { BookerPlan } from '@/lib/supabase/types';

import { cancelProAction } from '../actions';
import { cardClass, eyebrowClass, ghostButtonClass } from '../ui';
import { useProModal } from './pro-modal-context';

export function PlanCard({
  plan,
  periodEndsAt,
  canceled,
}: {
  plan: BookerPlan;
  periodEndsAt: string | null;
  canceled: boolean;
}) {
  const { openModal } = useProModal();
  const [state, formAction, pending] = useActionState(cancelProAction, {});

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Seu plano</p>
      {plan === 'pro' ? (
        <>
          <p className="mt-2 text-sm font-medium">Booker Pro — R$49/mês</p>
          {canceled && periodEndsAt ? (
            <p className="mt-1.5 text-sm text-[var(--ink)]/60">
              Cancelado — continua ativo até{' '}
              {new Date(`${periodEndsAt}T00:00:00`).toLocaleDateString('pt-BR')}.
            </p>
          ) : (
            <form action={formAction} className="mt-3 flex items-center gap-3">
              <button type="submit" disabled={pending} className={ghostButtonClass}>
                {pending ? 'Cancelando…' : 'Cancelar Pro'}
              </button>
              {state.error && <p className="text-sm text-red-700">{state.error}</p>}
            </form>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium">Booker Básico — R$0/mês</p>
          <button type="button" onClick={openModal} className={`${ghostButtonClass} mt-3`}>
            Conheça o Pro
          </button>
        </>
      )}
    </section>
  );
}
