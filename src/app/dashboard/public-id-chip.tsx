'use client';

import { useState } from 'react';

// "Seu código ID" (07/09/2026) — mesmo campo que já aparecia só pro
// artista em "Seus canais de booking" (professional-home-view.tsx),
// agora também pro Booker, que não tem uma Home com canais — aqui,
// perto do "Adicionar um Artista", é onde faz sentido ela compartilhar
// esse código com quem ainda não trocou contato. Mesma pele legacy/pro
// já usada em ResendInviteButton/AddConnectionModal.
type Variant = 'legacy' | 'pro';

export function PublicIdChip({ publicId, variant = 'legacy' }: { publicId: string; variant?: Variant }) {
  const isPro = variant === 'pro';
  const [copied, setCopied] = useState(false);

  const wrapClass = isPro
    ? 'flex items-center gap-2 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] px-3.5 py-2'
    : 'flex items-center gap-2 rounded-full bg-white px-3.5 py-2';
  const labelClass = isPro
    ? 'font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--pro-tx-50)]'
    : 'font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--ink)]/50';
  const valueClass = isPro ? 'font-doopla-mono text-[12px] text-[var(--pro-off)]' : 'font-doopla-mono text-[12px] text-[var(--ink)]';
  const buttonClass = isPro
    ? 'text-[11px] font-bold text-[var(--pro-red)] hover:underline'
    : 'text-[11px] font-bold text-[var(--accent-ink)] hover:underline';

  async function copy() {
    await navigator.clipboard.writeText(publicId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={wrapClass}>
      <span className={labelClass}>Seu código ID</span>
      <span className={valueClass}>{publicId}</span>
      <button type="button" onClick={copy} className={buttonClass}>
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
