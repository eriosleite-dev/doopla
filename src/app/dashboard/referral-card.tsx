'use client';

import { useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

export function ReferralCard({
  referralUrl,
  referralCount,
  qualifiedTotalCents,
}: {
  referralUrl: string;
  referralCount: number;
  qualifiedTotalCents: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-dashed border-[var(--line-light)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        <span className="font-doopla-mono uppercase tracking-[.06em] text-[var(--accent-ink)]">
          Indique. Ganhe R$5.
        </span>
        <span className="text-[var(--ink)]/55">
          {referralCount} {referralCount === 1 ? 'indicado' : 'indicados'} ·{' '}
          {formatCentsAsBRL(qualifiedTotalCents)} qualificado
        </span>
      </div>
      <button
        type="button"
        onClick={copyLink}
        className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/60 underline hover:text-[var(--accent-ink)]"
      >
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>
    </section>
  );
}
