'use client';

import { useState, useTransition } from 'react';

import { cancelInviteAction, resendInviteAction } from './actions';

// Reenvio de convite (migration 0069/hotfix pendingInviteToken) —
// mesma pele legacy/pro já usada em AddConnectionModal, reaproveitada
// aqui só pro botão + link novo (nunca duplica a lógica de copiar link).
type Variant = 'legacy' | 'pro';

export function ResendInviteButton({ inviteId, variant = 'legacy' }: { inviteId: string; variant?: Variant }) {
  const isPro = variant === 'pro';
  const [pending, startTransition] = useTransition();
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonClass = isPro
    ? 'font-pro-sub rounded-full border border-[var(--pro-line)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]'
    : 'font-doopla-mono rounded-full border border-[var(--line-light)] px-3 py-1.5 text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/70 hover:text-[var(--ink)]';
  const linkTextClass = isPro
    ? 'font-doopla-mono truncate text-[11.5px] text-[var(--pro-off)]'
    : 'font-doopla-mono truncate text-[11.5px] text-[var(--accent-ink)]';
  const errorTextClass = isPro ? 'text-[11.5px] text-[#ff8b80]' : 'text-[11.5px] text-red-700';

  function handleResend() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('inviteId', inviteId);
      const outcome = await resendInviteAction({}, formData);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      if (outcome.inviteToken) {
        setNewLink(`${window.location.origin}/convite/${outcome.inviteToken}`);
      }
    });
  }

  async function copyLink() {
    if (!newLink) return;
    await navigator.clipboard.writeText(newLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (newLink) {
    // min-w-0 no span (07/10/2026, mesmo bug já corrigido em
    // add-connection-modal.tsx): truncate sem min-w-0 num flex item não
    // encolhe, o link (texto longo sem espaços) empurra a linha pra
    // fora do card.
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className={`min-w-0 flex-1 ${linkTextClass}`}>{newLink}</span>
        <button type="button" onClick={copyLink} className={`flex-none ${buttonClass}`}>
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
      </div>
    );
  }

  if (error) {
    return <span className={errorTextClass}>{error}</span>;
  }

  return (
    <button type="button" disabled={pending} onClick={handleResend} className={buttonClass}>
      {pending ? 'Reenviando…' : 'Reenviar'}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Ver/copiar o link ATUAL de um convite pendente, sem reenviar — item
// separado de ResendInviteButton de propósito (achado da fundadora,
// 07/10/2026): "Reenviar" regenera o token (resend_invite, migration
// 0069), invalidando o link antigo. Isso é pra quem já tem o link mas
// perdeu/quer reenviar manualmente, sem gerar um link novo. Usa o
// token já trazido por getSentInvites (select('*')) — nenhuma chamada
// nova ao servidor, só construir a URL no client.
export function ViewInviteLinkButton({ token, variant = 'legacy' }: { token: string; variant?: Variant }) {
  const isPro = variant === 'pro';
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const iconButtonClass = isPro
    ? 'flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[var(--pro-line)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]'
    : 'flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[var(--line-light)] text-[var(--ink)]/60 hover:text-[var(--ink)]';
  const buttonClass = isPro
    ? 'font-pro-sub rounded-full border border-[var(--pro-line)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]'
    : 'font-doopla-mono rounded-full border border-[var(--line-light)] px-3 py-1.5 text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/70 hover:text-[var(--ink)]';
  const linkTextClass = isPro
    ? 'font-doopla-mono truncate text-[11.5px] text-[var(--pro-off)]'
    : 'font-doopla-mono truncate text-[11.5px] text-[var(--accent-ink)]';

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (typeof window === 'undefined') return null;
  const link = `${window.location.origin}/convite/${token}`;

  if (!revealed) {
    return (
      <button type="button" onClick={() => setRevealed(true)} aria-label="Ver link do convite" title="Ver link do convite" className={iconButtonClass}>
        <EyeIcon />
      </button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`min-w-0 flex-1 ${linkTextClass}`}>{link}</span>
      <button type="button" onClick={copyLink} className={`flex-none ${buttonClass}`}>
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>
    </div>
  );
}

// Cancelar convite pendente (migration 0102) — achado da fundadora:
// não existia jeito nenhum de desistir de um convite já enviado.
// Confirm() nativo antes de enviar — ação deleta de vez, sem desfazer.
export function CancelInviteButton({ inviteId, variant = 'legacy' }: { inviteId: string; variant?: Variant }) {
  const isPro = variant === 'pro';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const buttonClass = isPro
    ? 'font-pro-sub rounded-full border border-[var(--pro-line)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--pro-tx-50)] hover:text-[#ff8b80]'
    : 'font-doopla-mono rounded-full border border-[var(--line-light)] px-3 py-1.5 text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/55 hover:text-red-700';
  const errorTextClass = isPro ? 'text-[11.5px] text-[#ff8b80]' : 'text-[11.5px] text-red-700';

  function handleCancel() {
    if (!window.confirm('Cancelar esse convite? Não dá pra desfazer — a pessoa vai precisar de um link novo.')) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('inviteId', inviteId);
      const outcome = await cancelInviteAction({}, formData);
      if (outcome.error) setError(outcome.error);
    });
  }

  if (error) {
    return <span className={errorTextClass}>{error}</span>;
  }

  return (
    <button type="button" disabled={pending} onClick={handleCancel} className={buttonClass}>
      {pending ? 'Cancelando…' : 'Cancelar convite'}
    </button>
  );
}
