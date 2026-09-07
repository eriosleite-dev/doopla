'use client';

import { useState, useTransition } from 'react';

import { resendInviteAction } from './actions';

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
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={linkTextClass}>{newLink}</span>
        <button type="button" onClick={copyLink} className={buttonClass}>
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
