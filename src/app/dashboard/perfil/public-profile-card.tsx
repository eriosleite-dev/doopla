'use client';

import { useActionState, useState } from 'react';

import {
  disablePublicProfileAction,
  enablePublicProfileAction,
  updatePublicLinksAction,
} from '../actions';
import { accentButtonClass, cardClass, eyebrowClass, ghostButtonClass } from '../ui';

export function PublicProfileCard({
  slug,
  publicEnabled,
  instagramUrl,
  portfolioUrl,
  siteUrl,
}: {
  slug: string | null;
  publicEnabled: boolean;
  instagramUrl: string | null;
  portfolioUrl: string | null;
  siteUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [linksState, linksAction, linksPending] = useActionState(updatePublicLinksAction, {});
  const publicUrl = slug ? `${siteUrl}/${slug}` : null;

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Meu perfil público</p>

      {!publicEnabled ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--ink)]/60">
            Ative pra ter uma página pública com seu nome, categoria, bio e um link pra
            compartilhar.
          </p>
          <form action={enablePublicProfileAction}>
            <button type="submit" className={accentButtonClass}>
              Ativar perfil público
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--ink)]/20 bg-[var(--paper-dim)] p-4">
            <span className="font-doopla-mono text-[13px] text-[var(--accent-ink)]">
              {publicUrl}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={copyLink} className={ghostButtonClass}>
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
              {publicUrl && (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={ghostButtonClass}>
                  Visualizar como cliente
                </a>
              )}
            </div>
          </div>

          <form action={linksAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={eyebrowClass}>Instagram</span>
              <input
                type="url"
                name="instagramUrl"
                defaultValue={instagramUrl ?? ''}
                placeholder="https://instagram.com/seuusuario"
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={eyebrowClass}>Portfólio / Spotify / SoundCloud</span>
              <input
                type="url"
                name="portfolioUrl"
                defaultValue={portfolioUrl ?? ''}
                placeholder="https://..."
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={linksPending} className={ghostButtonClass}>
                {linksPending ? 'Salvando…' : 'Salvar links'}
              </button>
              {linksState.error && <p className="text-sm text-red-700">{linksState.error}</p>}
            </div>
          </form>

          <form action={disablePublicProfileAction}>
            <button
              type="submit"
              className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 underline hover:text-[var(--ink)]"
            >
              Desativar perfil público
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
