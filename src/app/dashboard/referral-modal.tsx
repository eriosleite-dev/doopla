'use client';

import { useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

import { useReferralModal } from './referral-modal-context';
import { eyebrowClass, ghostButtonClass } from './ui';

export function ReferralModal({
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
  const { open, closeModal } = useReferralModal();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  if (!open) return null;

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    try {
      await navigator.share({ url: referralUrl, title: 'Indique a Doopla' });
    } catch {
      // usuário cancelou o share nativo — sem tratamento necessário
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-5 rounded-[24px] bg-[var(--paper)] p-7 shadow-2xl">
        <div>
          <p className={eyebrowClass}>Indique e ganhe</p>
          <h2 className="font-doopla-display mt-1 text-2xl font-semibold">Indique. Ganhe R$5.</h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--ink)]/45">
            Seu link de indicação
          </span>
          <div className="rounded-[14px] bg-white px-4 py-3 text-sm break-all text-[var(--ink)]/80">
            {referralUrl}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="font-doopla-mono flex-1 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[11px] uppercase tracking-[.05em] text-[var(--paper)] transition-opacity hover:opacity-90"
          >
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={shareLink}
              className="font-doopla-mono flex-1 rounded-full border border-[var(--ink)] px-4 py-2.5 text-[11px] uppercase tracking-[.05em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              Compartilhar
            </button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-[14px] bg-white/60 px-4 py-3">
          <span className="text-sm text-[var(--ink)]/70">Você já ganhou</span>
          <span className="font-doopla-display text-lg font-semibold">
            {formatCentsAsBRL(qualifiedTotalCents)}
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed text-[var(--ink)]/55">
          {referralCount > 0
            ? `${referralCount} ${referralCount === 1 ? 'pessoa indicada' : 'pessoas indicadas'}${
                pendingCount > 0
                  ? `, ${pendingCount} ainda ${pendingCount === 1 ? 'pendente' : 'pendentes'}`
                  : ''
              }. `
            : ''}
          O bônus é liberado quando a pessoa indicada vira cliente pagante da Doopla. Até lá, a
          indicação aparece como pendente.
        </p>

        <button type="button" onClick={closeModal} className={ghostButtonClass}>
          Fechar
        </button>
      </div>
    </div>
  );
}
