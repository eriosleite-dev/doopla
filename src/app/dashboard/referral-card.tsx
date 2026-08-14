'use client';

import { useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';
import { ghostButtonClass } from './ui';

export function ReferralCard({
  referralUrl,
  referralCount,
  pendingCount,
  qualifiedTotalCents,
}: {
  referralUrl: string;
  referralCount: number;
  pendingCount: number;
  qualifiedTotalCents: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-[18px] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent-ink)]">
            Indique. Ganhe R$5.
          </p>
          <p className="mt-1 text-sm text-[var(--ink)]/70">
            Convide outro artista pra doopla com o seu link. O crédito é liberado só depois que a
            indicação for válida — nunca no clique do link ou no cadastro.
          </p>
        </div>
        <button type="button" onClick={copyLink} className={ghostButtonClass}>
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
      </div>

      <p className="font-doopla-mono mt-3 truncate rounded-full bg-[var(--paper-dim)] px-4 py-2 text-[12px] text-[var(--ink)]/60">
        {referralUrl}
      </p>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--line-light)] pt-4 text-[12.5px] text-[var(--ink)]/60">
        <span>
          {referralCount} {referralCount === 1 ? 'pessoa indicada' : 'pessoas indicadas'}
        </span>
        <span>
          {pendingCount} {pendingCount === 1 ? 'em análise' : 'em análise'}
        </span>
        <span>{formatCentsAsBRL(qualifiedTotalCents)} de crédito já qualificado</span>
      </div>
    </section>
  );
}
