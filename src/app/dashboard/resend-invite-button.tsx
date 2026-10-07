'use client';

import { useState, useTransition } from 'react';

import { cancelInviteAction, resendInviteAction } from './actions';

// Card de convite pendente (migration 0069/pendingInviteToken +
// 0102/cancel_invite) — redesign 07/10/2026 (achado da fundadora: "o
// atual está excessivamente horizontal, sem hierarquia"), revisado no
// mesmo dia (2ª rodada: "não gosto que aperta mostra link e abre
// aquele card, tem que ser mais simples tipo Nubank — aperta no olho,
// o que estava blur só mostra, não altera o card"). Antes eram 3
// componentes soltos (ResendInviteButton/ViewInviteLinkButton/
// CancelInviteButton); agora é 1 componente só, dono do próprio card
// (hierarquia vertical: nome -> status -> link com blur -> ações). O
// link fica sempre na mesma posição/altura — o olho só alterna blur,
// nunca monta/desmonta nada. Mesmas 3 Server Actions de sempre
// (resendInviteAction/cancelInviteAction), nenhuma lógica de convite,
// reenvio, cancelamento ou cópia mudou — só como isso é apresentado.
type Variant = 'legacy' | 'pro';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}

export function PendingInviteCard({
  inviteId,
  name,
  token,
  expired,
  variant = 'legacy',
}: {
  inviteId: string;
  name: string;
  token: string;
  expired: boolean;
  variant?: Variant;
}) {
  const isPro = variant === 'pro';
  const [currentToken, setCurrentToken] = useState(token);
  const [linkRevealed, setLinkRevealed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [resendPending, startResendTransition] = useTransition();
  const [resendError, setResendError] = useState<string | null>(null);
  const [cancelPending, startCancelTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cardClass = isPro
    ? 'rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-5 backdrop-blur-xl flex flex-col gap-3'
    : 'rounded-[14px] bg-white p-5 flex flex-col gap-3';
  const nameClass = isPro ? 'font-pro-sub text-[14px] font-bold text-[var(--pro-off)]' : 'font-doopla-display text-[15px] font-semibold text-[var(--ink)]';
  const statusClass = isPro ? 'text-[var(--pro-tx-50)]' : 'text-[var(--ink)]/55';
  const statusExpiredClass = isPro ? 'text-[var(--pro-amber)]' : 'text-amber-700';
  const linkValueClass = isPro ? 'font-doopla-mono truncate text-[12px] text-[var(--pro-tx-70)]' : 'font-doopla-mono truncate text-[12px] text-[var(--ink)]/70';
  const eyeButtonClass = isPro
    ? 'flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]'
    : 'flex-none text-[var(--ink)]/40 hover:text-[var(--ink)]';
  const copyBtnClass = isPro
    ? 'font-pro-sub flex-none text-[11px] font-bold text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]'
    : 'font-doopla-mono flex-none text-[10.5px] uppercase tracking-[.03em] text-[var(--ink)]/55 hover:text-[var(--ink)]';
  const resendBtnClass = isPro
    ? 'font-pro-sub text-[11.5px] font-bold text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]'
    : 'font-doopla-mono text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/70 hover:text-[var(--ink)]';
  // Terciário/discreto de propósito (achado da fundadora: não pode
  // competir visualmente com "Reenviar") — sem peso, tom mais apagado,
  // só fica vermelho no hover.
  const cancelBtnClass = isPro
    ? 'text-[11px] text-[var(--pro-tx-30)] hover:text-[#ff8b80]'
    : 'text-[11px] text-[var(--ink)]/40 hover:text-red-700';
  const errorTextClass = isPro ? 'text-[11.5px] text-[#ff8b80]' : 'text-[11.5px] text-red-700';
  const borderTopClass = isPro ? 'border-[var(--pro-line)]' : 'border-[var(--line-light)]';

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/convite/${currentToken}` : '';
  // Exibição curta (nunca monoespaçada grande, achado da fundadora) —
  // sem protocolo, cortada num tamanho legível; o link COPIADO
  // continua sendo a URL completa, isso é só apresentação.
  const displayUrl = inviteUrl.replace(/^https?:\/\//, '');
  const shortDisplayUrl = displayUrl.length > 34 ? `${displayUrl.slice(0, 31)}…` : displayUrl;

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleResend() {
    setResendError(null);
    startResendTransition(async () => {
      const formData = new FormData();
      formData.set('inviteId', inviteId);
      const outcome = await resendInviteAction({}, formData);
      if (outcome.error) {
        setResendError(outcome.error);
        return;
      }
      if (outcome.inviteToken) {
        setCurrentToken(outcome.inviteToken);
        setLinkRevealed(true);
      }
    });
  }

  function handleCancel() {
    if (!window.confirm('Cancelar esse convite? Não dá pra desfazer — a pessoa vai precisar de um link novo.')) return;
    setCancelError(null);
    startCancelTransition(async () => {
      const formData = new FormData();
      formData.set('inviteId', inviteId);
      const outcome = await cancelInviteAction({}, formData);
      if (outcome.error) setCancelError(outcome.error);
    });
  }

  return (
    <div className={cardClass}>
      <div>
        <p className={nameClass}>{name}</p>
        <p className={`mt-0.5 text-[12px] ${expired ? statusExpiredClass : statusClass}`}>
          {expired ? 'Convite expirado' : 'Convite pendente · Aguardando cadastro'}
        </p>
      </div>

      {/* Blur no lugar, nunca um bloco que aparece/some (achado da
         fundadora, 07/10/2026: "não gosto que aperta mostra link e
         ocultar abre aquele card... tem que ser mais simples tipo no
         Nubank, aperta no olho, o que estava blur só mostra, não
         altera o card"). O link fica sempre nesta mesma posição — o
         olho só troca a classe de blur na mesma `span`, nunca monta ou
         desmonta nada, card nunca muda de altura. */}
      {!expired && (
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`min-w-0 flex-1 ${linkValueClass} ${linkRevealed ? '' : 'select-none blur-[5px]'}`}
            title={linkRevealed ? inviteUrl : undefined}
          >
            {shortDisplayUrl}
          </span>
          <button
            type="button"
            onClick={() => setLinkRevealed((r) => !r)}
            aria-label={linkRevealed ? 'Esconder link do convite' : 'Mostrar link do convite'}
            aria-pressed={linkRevealed}
            className={eyeButtonClass}
          >
            {linkRevealed ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button type="button" onClick={copyLink} className={copyBtnClass}>
            {linkCopied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      )}

      {resendError && <p className={errorTextClass}>{resendError}</p>}
      {cancelError && <p className={errorTextClass}>{cancelError}</p>}

      <div className={`flex items-center justify-end gap-4 border-t pt-3 ${borderTopClass}`}>
        <button type="button" disabled={resendPending} onClick={handleResend} className={resendBtnClass}>
          {resendPending ? 'Reenviando…' : 'Reenviar'}
        </button>
        <button type="button" disabled={cancelPending} onClick={handleCancel} className={cancelBtnClass}>
          {cancelPending ? 'Cancelando…' : 'Cancelar convite'}
        </button>
      </div>
    </div>
  );
}
