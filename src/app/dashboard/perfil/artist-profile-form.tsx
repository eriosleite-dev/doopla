'use client';

import { useActionState } from 'react';

import { updateArtistProfileAction } from '../actions';
import { eyebrowClass, ghostButtonClass } from '../ui';

const inputClass =
  'rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const textareaClass =
  'rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const labelClass = 'flex flex-col gap-1.5';

export function ArtistProfileForm({
  stageName,
  category,
  subcategory,
  bio,
  genres,
  mercados,
  websiteUrl,
  otherLinks,
  otherPreferences,
  travels,
  servesOtherLocations,
  acceptsOutOfCityWork,
}: {
  stageName: string | null;
  category: string | null;
  subcategory: string | null;
  bio: string | null;
  genres: string[];
  mercados: string | null;
  websiteUrl: string | null;
  otherLinks: string | null;
  otherPreferences: string | null;
  travels: boolean;
  servesOtherLocations: boolean;
  acceptsOutOfCityWork: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateArtistProfileAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={eyebrowClass}>Nome artístico</span>
          <input type="text" name="stageName" defaultValue={stageName ?? ''} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={eyebrowClass}>Categoria</span>
          <input type="text" name="category" defaultValue={category ?? ''} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={eyebrowClass}>Subcategoria</span>
          <input type="text" name="subcategory" defaultValue={subcategory ?? ''} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={eyebrowClass}>Mercados</span>
          <input type="text" name="mercados" defaultValue={mercados ?? ''} className={inputClass} />
        </label>
      </div>

      <label className={labelClass}>
        <span className={eyebrowClass}>Bio</span>
        <textarea name="bio" rows={3} defaultValue={bio ?? ''} className={textareaClass} />
      </label>

      <label className={labelClass}>
        <span className={eyebrowClass}>Gêneros / estilos (separe por vírgula)</span>
        <input type="text" name="genres" defaultValue={genres.join(', ')} className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={eyebrowClass}>Site</span>
          <input
            type="url"
            name="websiteUrl"
            defaultValue={websiteUrl ?? ''}
            placeholder="https://..."
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={eyebrowClass}>Outros links</span>
          <input
            type="text"
            name="otherLinks"
            defaultValue={otherLinks ?? ''}
            placeholder="Spotify, SoundCloud, YouTube..."
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[14px] bg-[var(--paper-dim)] p-4">
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" name="travels" defaultChecked={travels} className="h-4 w-4" />
          Viajo para trabalhar
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="servesOtherLocations"
            defaultChecked={servesOtherLocations}
            className="h-4 w-4"
          />
          Atendo clientes de outras cidades
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="acceptsOutOfCityWork"
            defaultChecked={acceptsOutOfCityWork}
            className="h-4 w-4"
          />
          Aceito trabalho fora da minha cidade
        </label>
      </div>

      <label className={labelClass}>
        <span className={eyebrowClass}>Outras preferências</span>
        <textarea
          name="otherPreferences"
          rows={2}
          defaultValue={otherPreferences ?? ''}
          className={textareaClass}
        />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={ghostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar perfil'}
        </button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
