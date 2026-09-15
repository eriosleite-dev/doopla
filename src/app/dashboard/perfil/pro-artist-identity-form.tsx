'use client';

import { useActionState } from 'react';

import { updateArtistProfileAction } from '../actions';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';

const labelClass = 'flex flex-col gap-1.5';

// Redesign "Perfil e trabalho" (15/09/2026) — grupo "Informações
// profissionais". Antes desta rodada existiam também Gêneros/estilos,
// Site e Outros links: auditoria confirmou zero consumidor no
// Intelligence Context pros 3 (nem sequer a página pública do
// profissional exibe website_url/other_links) — critério do pedido
// ("que decisão da Doopla melhora por conhecer isso?") não se sustenta
// pra nenhum. Colunas preservadas no banco (genres/website_url/
// other_links), só não fazem mais parte desta UI — por isso a action
// (updateArtistProfileAction) para de escrever essas 3 chaves, nunca
// as sobrescreve pra null.
export function ProArtistIdentityForm({
  stageName,
  category,
  bio,
}: {
  stageName: string | null;
  category: string | null;
  bio: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateArtistProfileAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={proLabelClass}>Nome artístico</span>
          <input type="text" name="stageName" defaultValue={stageName ?? ''} className={proInputClass} />
        </label>
        <label className={labelClass}>
          <span className={proLabelClass}>Categoria</span>
          <input type="text" name="category" defaultValue={category ?? ''} className={proInputClass} />
        </label>
      </div>

      <label className={labelClass}>
        <span className={proLabelClass}>Bio</span>
        <textarea name="bio" rows={3} defaultValue={bio ?? ''} className={proInputClass} />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proGhostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state.success && !pending && <p className="text-[13px] text-[var(--pro-green)]">Salvo ✓</p>}
        {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
