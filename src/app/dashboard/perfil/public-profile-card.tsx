'use client';

import { useActionState, useState } from 'react';

import {
  disablePublicProfileAction,
  enablePublicProfileAction,
  updatePublicLinksAction,
} from '../actions';
import { proInputClass, proLabelClass, proGhostButtonClass, proPrimaryButtonClass } from '../pro-format';
import { ProCard } from '../pro-ui';

// Pro re-skin (Bloco 7, P1) — único consumidor é perfil/editar/
// (artista-only), sem contraparte Booker a preservar, então editado no
// lugar (mesma lógica do bloco 1, ConversaView/ReplyForm).
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
    <ProCard>
      <p className="font-pro-sub text-[13.5px] font-bold">Meu perfil público</p>

      {!publicEnabled ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[13px] text-[var(--pro-tx-50)]">
            Ative pra ter uma página pública com seu nome, categoria, bio e um link pra
            compartilhar.
          </p>
          <form action={enablePublicProfileAction}>
            <button type="submit" className={proPrimaryButtonClass}>
              Ativar perfil público
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-dashed border-[var(--pro-line)] bg-white/[0.03] p-4">
            <span className="font-doopla-mono text-[13px] text-[var(--pro-off)]">{publicUrl}</span>
            <div className="flex gap-2">
              <button type="button" onClick={copyLink} className={proGhostButtonClass}>
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
              {publicUrl && (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={proGhostButtonClass}>
                  Visualizar como cliente
                </a>
              )}
            </div>
          </div>

          <form action={linksAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={proLabelClass}>Instagram</span>
              <input
                type="url"
                name="instagramUrl"
                defaultValue={instagramUrl ?? ''}
                placeholder="https://instagram.com/seuusuario"
                className={proInputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={proLabelClass}>Portfólio / Spotify / SoundCloud</span>
              <input
                type="url"
                name="portfolioUrl"
                defaultValue={portfolioUrl ?? ''}
                placeholder="https://..."
                className={proInputClass}
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={linksPending} className={proGhostButtonClass}>
                {linksPending ? 'Salvando…' : 'Salvar links'}
              </button>
              {linksState.error && <p className="text-[12.5px] text-[var(--pro-red)]">{linksState.error}</p>}
            </div>
          </form>

          <form action={disablePublicProfileAction}>
            <button
              type="submit"
              className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] underline hover:text-[var(--pro-off)]"
            >
              Desativar perfil público
            </button>
          </form>
        </div>
      )}
    </ProCard>
  );
}
