'use client';

import { useEffect, useState } from 'react';

import { MARKETS, TRIAL_DAYS } from '@/lib/market';
import { getPlanCard } from '@/lib/plans';

import { proGhostButtonClass, proPrimaryButtonClass } from './pro-format';
import { ProMascot } from './pro-mascot';

// ProUpgradeModal (07/09/2026) — base reutilizável do novo padrão
// canônico de upgrade contextual: feature Pro → tentativa sem
// entitlement → modal, nunca navegação pra /dashboard/perfil ou
// /precos (ambas descontinuadas como destino de upgrade). Um só
// componente pra todo o produto — `context` só adapta título/descrição,
// nunca preço/features/entitlement/comportamento de CTA, que vêm
// sempre de @/lib/plans e @/lib/market (mesma fonte que o PlanPicker do
// onboarding usa). Não crie um modal novo por feature — estenda
// CONTEXT_COPY aqui.
//
// Mockup aprovado (07/09/2026) é a referência visual — composição,
// mascote, hierarquia — mas nunca fonte de features: nenhum item aqui
// é implementado só porque aparece ilustrado lá (analytics/materiais/
// automações/e-mail de representação continuam PENDING, de fora do
// catálogo até terem gate real).
//
// CTA principal ("Fazer upgrade para Pro") propositalmente SEM
// comportamento ainda — Real Billing/Stripe não existe, e o
// comportamento temporário honesto depende de aprovação explícita
// (ver PROGRESS.md). Não adicione onClick aqui sem essa aprovação.
export type ProUpgradeContext = 'equipe' | 'geral';

const CONTEXT_COPY: Record<ProUpgradeContext, { eyebrow: string; title: string; description: string }> = {
  equipe: {
    eyebrow: 'Doopla Pro',
    title: 'Desbloqueie Minha equipe com Doopla Pro',
    description: 'Convide um Booker pra representar sua carreira e trabalhem juntos na mesma Doopla.',
  },
  geral: {
    eyebrow: 'Doopla Pro',
    title: 'Mais estrutura pra sua carreira crescer',
    description: 'Veja o que muda no Doopla Pro.',
  },
};

export function ProUpgradeModal({
  open,
  onClose,
  context = 'geral',
}: {
  open: boolean;
  onClose: () => void;
  context?: ProUpgradeContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const copy = CONTEXT_COPY[context];
  const market = MARKETS.BR;
  const pro = getPlanCard('pro');

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      setExpanded(false);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pro-shell contents">
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6" role="presentation">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Doopla Pro"
          className="relative max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-[24px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-6 shadow-[0_0_70px_rgba(226,41,28,.18)] sm:p-8"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-5 right-5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4 pr-8">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-full border border-[var(--pro-red)] px-3 py-1 font-doopla-mono text-[10.5px] font-bold uppercase tracking-[.1em] text-[var(--pro-red)]">
                {copy.eyebrow}
              </span>
              <h2 className="font-pro-sub mt-4 text-[24px] font-bold leading-[1.15] text-[var(--pro-off)] sm:text-[28px]">
                {copy.title}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--pro-tx-70)]">{copy.description}</p>
            </div>
            <ProMascot size={56} />
          </div>

          <div className="mt-6 flex flex-col gap-5 rounded-[16px] border border-[var(--pro-line)] bg-white/[0.03] p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-none">
              <p className="font-pro-sub text-[32px] leading-none text-[var(--pro-off)]">
                {market.currencySymbol}
                {market.pricing.pro.toFixed(2).replace('.', ',')}
                <span className="text-[14px] font-normal text-[var(--pro-tx-50)]">/mês</span>
              </p>
              <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">{TRIAL_DAYS} dias grátis · sem cartão</p>
            </div>

            <ul className="flex flex-col gap-2">
              {pro.features.map((f) => (
                <ProFeatureItem key={f} label={f} />
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="mt-3 w-full text-center font-doopla-mono text-[11px] font-bold uppercase tracking-[.05em] text-[var(--pro-tx-50)] transition-colors hover:text-[var(--pro-off)]"
            aria-expanded={expanded}
            aria-controls="pro-upgrade-modal-more"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Mostrar menos ↑' : 'Ver todos os recursos ↓'}
          </button>

          <ul
            id="pro-upgrade-modal-more"
            aria-hidden={!expanded}
            className={`flex flex-col gap-2 overflow-hidden px-1 transition-all duration-300 ${
              expanded ? 'mt-2 max-h-[400px] border-t border-dashed border-[var(--pro-line)] pt-3 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            {pro.moreFeatures.map((f) => (
              <ProFeatureItem key={f} label={f} />
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" className={`${proPrimaryButtonClass} flex-1 justify-center`}>
              Fazer upgrade para Pro
            </button>
            <button type="button" onClick={onClose} className={`${proGhostButtonClass} flex-1 justify-center`}>
              Continuar no Básico
            </button>
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--pro-tx-30)]">
            Ainda não temos cobrança online. Em breve você poderá assinar o Doopla Pro diretamente aqui.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProFeatureItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-snug text-[var(--pro-tx-70)]">
      <span className="mt-[3px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-[var(--pro-red)] text-[9px] text-[var(--pro-off)]">
        ✓
      </span>
      {label}
    </li>
  );
}
