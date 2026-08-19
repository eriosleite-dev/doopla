'use client';

import { useState } from 'react';

import { enablePublicProfileAction } from './actions';
import { LinkRoutingForm, type BookerOption } from './link-routing-form';
import { accentButtonClass, cardClass, eyebrowClass, ghostButtonClass } from './ui';
import type { LinkRoutingMode } from '@/lib/supabase/types';

export function OrcamentoLinkCard({
  publicEnabled,
  orcamentoUrl,
  routingMode,
  bookerId,
  bookerName,
  bookers,
}: {
  publicEnabled: boolean;
  orcamentoUrl: string | null;
  routingMode: LinkRoutingMode;
  bookerId: string | null;
  bookerName: string | null;
  bookers: BookerOption[];
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  async function copyLink() {
    if (!orcamentoUrl) return;
    await navigator.clipboard.writeText(orcamentoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if (!orcamentoUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Peça um orçamento comigo pela doopla', url: orcamentoUrl });
      } catch {
        // Cancelado pela pessoa — não é erro.
      }
    } else {
      await copyLink();
    }
  }

  if (!publicEnabled || !orcamentoUrl) {
    return (
      <section className={cardClass}>
        <p className={eyebrowClass}>Seu link de orçamento</p>
        <h2 className="font-doopla-display mt-2 text-lg font-semibold">
          Comece a receber pedidos de booking.
        </h2>
        <p className="mt-1.5 text-sm text-[var(--ink)]/60">
          Tenha um link profissional pra seus clientes enviarem propostas direto pela doopla.
        </p>
        <form action={enablePublicProfileAction} className="mt-4">
          <button type="submit" className={accentButtonClass}>
            Ativar meu link
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Seu link de orçamento</p>
      <p className="mt-1.5 text-sm text-[var(--ink)]/60">
        Receba pedidos de booking direto pela doopla. Compartilhe no Instagram, WhatsApp, bio,
        site ou onde seus clientes já encontram você.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--ink)]/20 bg-[var(--paper-dim)] p-4">
        <span className="font-doopla-mono truncate text-[13px] text-[var(--accent-ink)]">
          {orcamentoUrl}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className={ghostButtonClass}>
            {copied ? 'Link copiado!' : 'Copiar link'}
          </button>
          <button type="button" onClick={shareLink} className={ghostButtonClass}>
            Compartilhar
          </button>
          <a href={orcamentoUrl} target="_blank" rel="noopener noreferrer" className={ghostButtonClass}>
            Ver como cliente
          </a>
        </div>
      </div>

      <div className="mt-4 text-[12.5px] text-[var(--ink)]/60">
        <span className="font-doopla-mono block text-[10px] uppercase tracking-[.06em] text-[var(--ink)]/40">
          Novos pedidos vão para
        </span>
        <span className="mt-0.5 block">
          {routingMode === 'eu' && 'Você'}
          {routingMode === 'meu_booker' && (bookerName ?? 'Seu booker')}
          {routingMode === 'eu_e_meu_booker' && `Você + ${bookerName ?? 'seu booker'}`}
          {' · '}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 underline hover:text-[var(--ink)]"
          >
            {editing ? 'Fechar' : 'Alterar'}
          </button>
        </span>
      </div>

      {editing && (
        <div className="mt-4 rounded-[14px] border border-[var(--ink)]/12 p-4">
          <LinkRoutingForm
            bookers={bookers}
            currentMode={routingMode}
            currentBookerId={bookerId}
            onSaved={() => setEditing(false)}
          />
        </div>
      )}
    </section>
  );
}
