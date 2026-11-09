'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateArtistPlanAction } from '../../actions';
import { proGhostButtonClass, proPrimaryButtonClass } from '../../pro-format';
import { ProUpgradeModal } from '../../pro-upgrade-modal';
import { ProCard } from '../../pro-ui';
import { hasDooplaPro } from '@/lib/subscription';
import type { Subscription } from '@/lib/supabase/types';
import { ProSettingsDetailHeader } from '../settings-ui';

// Settings V2 — Plano e assinatura (08/09/2026). Estados realmente
// suportados hoje: trialing (Básico ou Pro), ativo, cancelado — nunca
// um estado de billing inventado (sem processador de pagamento real
// ainda, mesmo estágio do resto do produto). Trocar de plano só é uma
// ação real ENQUANTO trialing — select_artist_plan (migration 0075)
// rejeita fora disso; depois do trial, upgrade passa pelo
// ProUpgradeModal canônico (mesmo padrão do resto do produto), nunca
// uma segunda superfície de contratação.
export function ProAssinaturaView({ subscription }: { subscription: Subscription | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const hasPro = hasDooplaPro(subscription);
  const isTrialing = subscription?.status === 'trialing';
  const isCanceled = Boolean(subscription?.canceled_at);
  const trialEndsAtLabel = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')
    : null;

  const statusLabel = isTrialing
    ? hasPro
      ? `Período de teste${trialEndsAtLabel ? ` até ${trialEndsAtLabel}` : ''}`
      : `Período de teste encerrado${trialEndsAtLabel ? ` em ${trialEndsAtLabel}` : ''}`
    : isCanceled
      ? 'Cancelado'
      : hasPro
        ? 'Ativo'
        : 'Plano gratuito';

  function switchPlan(plan: 'doopla' | 'pro') {
    setError(null);
    startTransition(async () => {
      const result = await updateArtistPlanAction(plan);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main>
      <ProSettingsDetailHeader title="Plano e assinatura" />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14.5px] font-semibold text-[var(--pro-off)]">{hasPro ? 'Doopla Pro' : 'Doopla Básico'}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--pro-tx-50)]">{statusLabel}</p>
            </div>
            {!hasPro && (
              <button type="button" onClick={() => setUpgradeModalOpen(true)} className={proGhostButtonClass}>
                Conhecer o Pro
              </button>
            )}
          </div>

          {isTrialing && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--pro-line)] pt-4">
              <p className="w-full text-[12px] text-[var(--pro-tx-50)]">
                Durante o teste você pode trocar de plano quando quiser, sem custo.
              </p>
              <button
                type="button"
                onClick={() => switchPlan('doopla')}
                disabled={pending || !hasPro}
                className={!hasPro ? proPrimaryButtonClass : proGhostButtonClass}
              >
                Doopla Básico
              </button>
              <button
                type="button"
                onClick={() => switchPlan('pro')}
                disabled={pending || hasPro}
                className={hasPro ? proPrimaryButtonClass : proGhostButtonClass}
              >
                Doopla Pro
              </button>
            </div>
          )}

          {error && <p className="mt-3 text-[12.5px] text-[var(--pro-red)]">{error}</p>}
        </ProCard>

        <ProUpgradeModal open={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} context="geral" />

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Pagamento</p>
          <p className="mt-2 text-[12.5px] text-[var(--pro-tx-50)]">
            A Doopla ainda não processa cobranças online. Quando isso existir, sua forma de pagamento e o histórico de
            cobranças aparecem aqui.
          </p>
        </ProCard>
      </div>
    </main>
  );
}
