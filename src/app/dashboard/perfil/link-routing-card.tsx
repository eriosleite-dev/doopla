'use client';

import { useState } from 'react';

import { LinkRoutingForm, type BookerOption } from '../link-routing-form';
import { cardClass, eyebrowClass, ghostButtonClass } from '../ui';
import type { LinkRoutingMode } from '@/lib/supabase/types';

export function LinkRoutingCard({
  bookers,
  currentMode,
  currentBookerId,
  orcamentoUrl,
}: {
  bookers: BookerOption[];
  currentMode: LinkRoutingMode;
  currentBookerId: string | null;
  orcamentoUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!orcamentoUrl) return;
    await navigator.clipboard.writeText(orcamentoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section id="roteamento" className={`${cardClass} scroll-mt-6`}>
      <p className={eyebrowClass}>Seu link de orçamento</p>

      {orcamentoUrl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--ink)]/20 bg-[var(--paper-dim)] p-4">
          <span className="font-doopla-mono text-[13px] text-[var(--accent-ink)]">
            {orcamentoUrl}
          </span>
          <button type="button" onClick={copyLink} className={ghostButtonClass}>
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      )}

      <p className={`${eyebrowClass} mt-6`}>Quem recebe seus pedidos de orçamento</p>

      <div className="mt-4">
        <LinkRoutingForm bookers={bookers} currentMode={currentMode} currentBookerId={currentBookerId} />
      </div>
    </section>
  );
}
