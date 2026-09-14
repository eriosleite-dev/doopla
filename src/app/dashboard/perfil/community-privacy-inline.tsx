'use client';

import { useState, useTransition } from 'react';

import { loadCommunityPrivacyAction } from '../community-privacy-actions';
import { proGhostButtonClass } from '../pro-format';
import { CommunityPrivacyForm } from './privacidade/comunidade/community-privacy-form';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadCommunityPrivacyAction>>['loaded']>;

// Painel inline dentro do acordeão "Privacidade e dados" (Settings V2,
// 14/09/2026) — antes era a subpágina própria
// /dashboard/perfil/privacidade/comunidade. Continua colapsado até o
// profissional clicar "Ver privacidade na Comunidade": só nesse
// momento chama loadCommunityPrivacyAction (ver o comentário lá pra
// entender por que a busca não pode rodar junto com o resto de
// Configurações).
export function CommunityPrivacyInline() {
  const [state, setState] = useState<'closed' | 'loading' | 'error' | 'ready'>('closed');
  const [snapshot, setSnapshot] = useState<Loaded | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setState('loading');
    startTransition(async () => {
      const result = await loadCommunityPrivacyAction();
      if (result.error || !result.loaded) {
        setState('error');
        return;
      }
      setSnapshot(result.loaded);
      setState('ready');
    });
  }

  if (state === 'closed') {
    return (
      <button type="button" onClick={open} disabled={pending} className={proGhostButtonClass}>
        Ver privacidade na Comunidade
      </button>
    );
  }

  if (state === 'loading') {
    return <p className="text-[12.5px] text-[var(--pro-tx-50)]">Carregando…</p>;
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[12.5px] text-[var(--pro-red)]">Não foi possível carregar agora.</p>
        <button type="button" onClick={open} className={proGhostButtonClass}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--pro-tx-50)]">
        O que outros profissionais veem no seu perfil público dentro da Comunidade — não afeta seus dados profissionais
        gerais na Doopla.
      </p>
      <CommunityPrivacyForm
        availableForReferrals={snapshot!.availableForReferrals}
        showCity={snapshot!.showCity}
        showAvatar={snapshot!.showAvatar}
        showBio={snapshot!.showBio}
        showSpecialties={snapshot!.showSpecialties}
        showWorkTypes={snapshot!.showWorkTypes}
        showInstagram={snapshot!.showInstagram}
        showPortfolio={snapshot!.showPortfolio}
      />
    </div>
  );
}
