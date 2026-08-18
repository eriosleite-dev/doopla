'use client';

import { useActionState, useState } from 'react';

import { chooseActiveArtistAction } from '../actions';
import { accentButtonClass, ghostButtonClass } from '../ui';

// Mostrado uma vez, na primeira entrada depois de um downgrade
// automático Pro->Básico — o sistema já escolheu um artista ativo por
// prioridade (ver expire_booker_pro_subscriptions), mas o booker pode
// trocar essa escolha uma única vez aqui.
export function PostDowngradeBanner({
  artists,
  activeArtistId,
}: {
  artists: { profileId: string; name: string }[];
  activeArtistId: string | null;
}) {
  const [state, formAction, pending] = useActionState(chooseActiveArtistAction, {});
  const [choosing, setChoosing] = useState(false);
  const activeName = artists.find((a) => a.profileId === activeArtistId)?.name ?? 'um artista';

  if (!choosing) {
    return (
      <section className="rounded-[18px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-5">
        <p className="text-sm font-medium text-[var(--ink)]">Seu plano agora é Booker Básico</p>
        <p className="mt-1.5 text-sm text-[var(--ink)]/75">
          O Básico permite gerenciar 1 artista. Como seu Pro terminou, mantivemos {activeName} como
          seu artista ativo.
        </p>
        <button type="button" onClick={() => setChoosing(true)} className={`${ghostButtonClass} mt-3`}>
          Escolher outro artista
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-[18px] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-5">
      <p className="text-sm font-medium text-[var(--ink)]">Escolha seu artista ativo</p>
      <form action={formAction} className="mt-3 flex flex-col gap-2">
        {artists.map((a) => (
          <label key={a.profileId} className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="artistProfileId"
              value={a.profileId}
              defaultChecked={a.profileId === activeArtistId}
              className="h-4 w-4"
            />
            {a.name}
          </label>
        ))}
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" disabled={pending} className={accentButtonClass}>
            {pending ? 'Salvando…' : 'Confirmar'}
          </button>
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        </div>
      </form>
    </section>
  );
}
