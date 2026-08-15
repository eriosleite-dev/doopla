'use client';

import { useActionState } from 'react';

import { updateBookerProfileAction } from '../actions';
import { eyebrowClass, ghostButtonClass } from '../ui';

const inputClass =
  'rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const textareaClass =
  'rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const labelClass = 'flex flex-col gap-1.5';

export function BookerProfileForm({
  professionalName,
  bio,
  mercados,
  specialties,
  experience,
  instagramUrl,
}: {
  professionalName: string | null;
  bio: string | null;
  mercados: string | null;
  specialties: string | null;
  experience: string | null;
  instagramUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateBookerProfileAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className={labelClass}>
        <span className={eyebrowClass}>Nome profissional</span>
        <input
          type="text"
          name="professionalName"
          defaultValue={professionalName ?? ''}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        <span className={eyebrowClass}>Bio</span>
        <textarea name="bio" rows={3} defaultValue={bio ?? ''} className={textareaClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={eyebrowClass}>Mercados</span>
          <input type="text" name="mercados" defaultValue={mercados ?? ''} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={eyebrowClass}>Instagram</span>
          <input
            type="url"
            name="instagramUrl"
            defaultValue={instagramUrl ?? ''}
            placeholder="https://instagram.com/seuusuario"
            className={inputClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        <span className={eyebrowClass}>Especialidades</span>
        <input type="text" name="specialties" defaultValue={specialties ?? ''} className={inputClass} />
      </label>

      <label className={labelClass}>
        <span className={eyebrowClass}>Experiência</span>
        <textarea name="experience" rows={2} defaultValue={experience ?? ''} className={textareaClass} />
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
