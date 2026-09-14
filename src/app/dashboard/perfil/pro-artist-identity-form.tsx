'use client';

import { useActionState } from 'react';

import { updateArtistProfileAction } from '../actions';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';

const labelClass = 'flex flex-col gap-1.5';

// Settings V2 consolidado (09/09/2026) — "Dados profissionais", um dos
// 3 conceitos em que o antigo /dashboard/perfil/editar (uma página só)
// foi decomposto. Só identidade/apresentação (nome artístico,
// categoria, bio, gêneros, mercados, site, outros links) — contexto de
// trabalho/representação virou rota própria ("Como você trabalha",
// pro-work-context-form.tsx) com sua própria action, pra um salvar não
// zerar os campos do outro.
export function ProArtistIdentityForm({
  stageName,
  category,
  subcategory,
  bio,
  genres,
  mercados,
  websiteUrl,
  otherLinks,
}: {
  stageName: string | null;
  category: string | null;
  subcategory: string | null;
  bio: string | null;
  genres: string[];
  mercados: string | null;
  websiteUrl: string | null;
  otherLinks: string | null;
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
        <label className={labelClass}>
          <span className={proLabelClass}>Subcategoria</span>
          <input type="text" name="subcategory" defaultValue={subcategory ?? ''} className={proInputClass} />
        </label>
        <label className={labelClass}>
          <span className={proLabelClass}>Mercados</span>
          <input type="text" name="mercados" defaultValue={mercados ?? ''} className={proInputClass} />
        </label>
      </div>

      <label className={labelClass}>
        <span className={proLabelClass}>Bio</span>
        <textarea name="bio" rows={3} defaultValue={bio ?? ''} className={proInputClass} />
      </label>

      <label className={labelClass}>
        <span className={proLabelClass}>Gêneros / estilos (separe por vírgula)</span>
        <input type="text" name="genres" defaultValue={genres.join(', ')} className={proInputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={proLabelClass}>Site</span>
          <input
            type="url"
            name="websiteUrl"
            defaultValue={websiteUrl ?? ''}
            placeholder="https://..."
            className={proInputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={proLabelClass}>Outros links</span>
          <input
            type="text"
            name="otherLinks"
            defaultValue={otherLinks ?? ''}
            placeholder="Spotify, SoundCloud, YouTube..."
            className={proInputClass}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proGhostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
