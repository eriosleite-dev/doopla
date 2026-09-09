'use client';

import { useState } from 'react';

import { ProLinkRoutingForm } from '../pro-link-routing-form';
import type { BookerOption } from '../link-routing-form';
import { proGhostButtonClass } from '../pro-format';
import { ProCard } from '../pro-ui';
import type { LinkRoutingMode } from '@/lib/supabase/types';

// Pro re-skin (Bloco 7, P1) — único consumidor é perfil/editar/
// (artista-only). O formulário interno (ProLinkRoutingForm) é o fork
// Pro de LinkRoutingForm — o original continua servindo o Booker via
// orcamento-link-card.tsx, intocado.
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
    <ProCard id="roteamento" className="scroll-mt-6">
      <p className="font-pro-sub text-[13.5px] font-bold">Seu link de orçamento</p>

      {orcamentoUrl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.03] p-4">
          <span className="font-doopla-mono text-[13px] text-[var(--pro-off)]">{orcamentoUrl}</span>
          <button type="button" onClick={copyLink} className={proGhostButtonClass}>
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      )}

      <p className="font-pro-sub mt-6 text-[13.5px] font-bold">Quem recebe seus pedidos de orçamento</p>

      <div className="mt-4">
        <ProLinkRoutingForm bookers={bookers} currentMode={currentMode} currentBookerId={currentBookerId} />
      </div>
    </ProCard>
  );
}
