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
    ? 'flex items-center gap-2.5 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] py-1.5 pl-3.5 pr-1.5'
    : 'flex items-center gap-2.5 rounded-full bg-white py-1.5 pl-3.5 pr-1.5';
  const labelClass = isPro
    ? 'font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--pro-tx-50)]'
    : 'font-doopla-mono text-[10px] uppercase tracking-[.05em] text-[var(--ink)]/50';
  // Valor com cara de "objeto" próprio (badge com fundo), não mais uma
  // palavra solta do mesmo tamanho/peso do rótulo e do botão — era
  // exatamente essa igualdade visual que fazia label+valor+ação lerem
  // como uma frase corrida com fontes trocadas (achado da fundadora,
  // 07/10/2026).
  // font-medium (500), não font-bold — achado da fundadora, 07/10/2026:
  // "eduarda em negrito está muito forte". O badge (fundo próprio) já
  // separa o valor visualmente do label/ação, sem precisar de peso
  // pesado também.
  const valueClass = isPro
    ? 'font-doopla-mono rounded-full bg-white/[0.06] px-2.5 py-1 text-[12.5px] font-medium text-[var(--pro-off)]'
    : 'font-doopla-mono rounded-full bg-[var(--paper-dim)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--ink)]';
  const copyButtonClass = isPro
    ? 'flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-[var(--pro-line)] text-[11px] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]'
    : 'flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-[var(--line-light)] text-[11px] text-[var(--ink)]/70 hover:border-[var(--ink)]/40 hover:text-[var(--ink)]';

  async function copy() {
    await navigator.clipboard.writeText(publicId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={wrapClass}>
      <span className={labelClass}>Seu código ID</span>
      <span className={valueClass}>{publicId}</span>
      {/* Botão de ícone (mesmo padrão visual de ProCopyButton, usado
         pro mesmo conceito de "código" em professional-home-view.tsx)
         em vez de um "Copiar" solto em texto — some de ação lida como
         botão, não como mais uma palavra da frase. */}
      <button type="button" onClick={copy} aria-label="Copiar código" className={copyButtonClass}>
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  );
}
