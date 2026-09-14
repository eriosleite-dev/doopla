'use client';

import { useEffect, useState } from 'react';

import { formatCentsAsBRL } from '@/lib/format';

import { useReferralModal } from './referral-modal-context';

// Recomposição visual (07/09/2026, proposta aprovada pelo founder) —
// saiu do sistema antigo (Fraunces serifado, fundo --paper bege), o
// único ponto do fluxo de indicação que ainda destoava do resto do
// painel profissional (já todo dark/sans-serif). Mesma família visual
// do LoginModal/CreateAccountModal (pro-shell/pro-panel-solid) e do
// selo verde com brilho que já existe no card "Indique e ganhe" da
// Home (professional-home-view.tsx). Conteúdo, dados e lógica
// idênticos ao modal anterior — link de indicação, total já ganho,
// contagem de indicações e a explicação de quando o bônus libera —
// só a composição muda: o valor ganho sobe pro topo (era uma linha
// discreta perto do rodapé), Fechar vira ✕ no canto (nenhum modal do
// produto novo usa botão "Fechar"), e copiar o link vira um ícone
// embutido no próprio campo (mesmo padrão de "Seu link de
// orçamento"/"Seu código ID" já usado em outros cards do painel).
// Este modal só aparece pra artista (referralSummary só é calculado
// pra profile.role === 'artista' em dashboard/layout.tsx) — nunca
// precisa da pele "legacy" que o Booker ainda usa em outros pontos.
//
// Sem EyeLogo aqui de propósito: esse componente depende de CSS
// escopado a #home-marketing/#site-chrome (ver comentário em
// pro-shell.tsx) e não é portável pro painel — por instrução
// explícita de review anterior, nunca vira wordmark do dashboard.
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

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closeModal]);

  if (!open) return null;

  async function copyLink() {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  async function shareLink() {
    try {
      await navigator.share({ url: referralUrl, title: 'Indique a Doopla' });
    } catch {
      // usuário cancelou o share nativo — sem tratamento necessário
    }
  }

  return (
    <div className="pro-shell contents">
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
        role="presentation"
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={closeModal}
          aria-hidden="true"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Indique e ganhe"
          className="relative max-h-[92vh] w-full max-w-[400px] overflow-y-auto rounded-[24px] border border-[rgba(62,207,110,.28)] bg-[var(--pro-panel-solid)] p-7 shadow-[0_0_70px_rgba(62,207,110,.16)] sm:p-8"
        >
          <button
            type="button"
            onClick={closeModal}
            aria-label="Fechar"
            className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>

          <div className="flex flex-col items-center gap-1 pt-2 text-center">
            <div
              className="mb-1 flex h-16 w-16 items-center justify-center rounded-full font-pro-display text-[22px] text-[var(--pro-black)]"
              style={{ background: 'radial-gradient(circle at 40% 35%, #4ee27a, var(--pro-green) 65%)', boxShadow: '0 0 30px rgba(62,207,110,.5)' }}
            >
              $
            </div>
            <p className="font-pro-display text-[34px] leading-none text-[var(--pro-green)]">
              {formatCentsAsBRL(qualifiedTotalCents)}
            </p>
            <p className="text-[11.5px] text-[var(--pro-tx-50)]">Você já ganhou</p>
          </div>

          <div className="mt-6 flex flex-col gap-1">
            <span className="font-doopla-mono text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--pro-green)]">
              Indique e ganhe
            </span>
            <h2 className="font-pro-display text-[27px] uppercase leading-[1.04] text-[var(--pro-off)]">
              Indique. Ganhe R$5.
            </h2>
          </div>

          <div className="mt-6 flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--pro-tx-50)]">Seu link de indicação</span>
            <div className="flex items-center gap-2.5 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-3.5 py-2.5">
              <span className="font-doopla-mono flex-1 truncate text-[12px] text-[var(--pro-off)]">{referralUrl}</span>
              <button
                type="button"
                onClick={copyLink}
                aria-label={copied ? 'Link copiado' : 'Copiar link'}
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-[var(--pro-line)] text-[11px] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]"
              >
                {copied ? '✓' : '⧉'}
              </button>
            </div>
          </div>

          {canShare && (
            <button
              type="button"
              onClick={shareLink}
              className="font-pro-sub mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pro-green)] py-3.5 text-[13.5px] font-bold uppercase tracking-[.04em] text-[var(--pro-black)] shadow-[0_0_22px_rgba(62,207,110,.4)] transition-opacity hover:opacity-90"
            >
              Compartilhar
            </button>
          )}

          {referralCount > 0 && (
            <p className="mt-5 text-center text-[12px] text-[var(--pro-tx-50)]">
              <strong className="font-semibold text-[var(--pro-off)]">
                {referralCount} {referralCount === 1 ? 'pessoa indicada' : 'pessoas indicadas'}
              </strong>
              {pendingCount > 0 &&
                ` · ${pendingCount} ${pendingCount === 1 ? 'ainda pendente' : 'ainda pendentes'}`}
            </p>
          )}

          <p className="mt-4 border-t border-[var(--pro-line)] pt-4 text-center text-[11px] leading-relaxed text-[var(--pro-tx-30)]">
            O bônus é liberado quando a pessoa indicada vira cliente pagante da Doopla. Até lá, a
            indicação aparece como pendente.
          </p>
        </div>
      </div>
    </div>
  );
}
