'use client';

import type { BookerPlan } from '@/lib/supabase/types';

import { useProModal } from './pro-modal-context';

// Básico mostra "Conheça o Pro" — some sozinho quando o plano vira Pro
// com assinatura ativa (regra: quem já é Pro não vê upsell nenhum).
export function ProSidebarBadge({ plan }: { plan: BookerPlan }) {
  const { openModal } = useProModal();

  if (plan === 'pro') {
    return (
      <div className="flex items-center justify-between rounded-[14px] bg-white/[0.04] px-3.5 py-2.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--paper)]/70">
          Booker Pro
        </span>
        <span className="font-doopla-mono rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-semibold text-[var(--ink)]">
          PRO
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-[14px] bg-white/[0.04] px-3.5 py-2.5">
      <span className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--paper)]/70">
        Booker Básico
      </span>
      <button
        type="button"
        onClick={openModal}
        className="font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--accent)] hover:underline"
      >
        Conheça o Pro →
      </button>
    </div>
  );
}
