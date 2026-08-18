'use client';

import { useActionState } from 'react';

import {
  ARTIST_CATEGORY_OPTIONS,
  CAPACITY_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  FEE_RANGE_OPTIONS,
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  SPECIALTY_AREA_OPTIONS,
} from '@/lib/matching-options';

import { updateBookerProfileAction } from '../actions';
import { eyebrowClass, ghostButtonClass } from '../ui';
import { ChipCheckboxGroup } from './chip-checkbox-group';

const inputClass =
  'rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const textareaClass =
  'rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const labelClass = 'flex flex-col gap-1.5';

export function BookerProfileForm({
  professionalName,
  bio,
  mercados,
  experience,
  instagramUrl,
  websiteUrl,
  capacity,
  feeRange,
  artistCategories,
  clientTypes,
  regions,
  languages,
  specialtyAreas,
}: {
  professionalName: string | null;
  bio: string | null;
  mercados: string | null;
  experience: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  capacity: string | null;
  feeRange: string[];
  artistCategories: string[];
  clientTypes: string[];
  regions: string[];
  languages: string[];
  specialtyAreas: string[];
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
      </div>

      <label className={labelClass}>
        <span className={eyebrowClass}>Experiência</span>
        <textarea name="experience" rows={2} defaultValue={experience ?? ''} className={textareaClass} />
      </label>

      <div className="flex flex-col gap-4 border-t border-[var(--ink)]/10 pt-4">
        <p className="text-[12.5px] text-[var(--ink)]/55">
          Os campos abaixo alimentam o matching com artistas — usados pra te encontrar em buscas
          e sugestões, não aparecem soltos no seu perfil.
        </p>
        <ChipCheckboxGroup
          name="specialtyAreas"
          label="Suas especialidades"
          options={SPECIALTY_AREA_OPTIONS}
          defaultValues={specialtyAreas}
        />
        <ChipCheckboxGroup
          name="artistCategories"
          label="Categorias de artista com quem você trabalha"
          options={ARTIST_CATEGORY_OPTIONS}
          defaultValues={artistCategories}
        />
        <ChipCheckboxGroup
          name="clientTypes"
          label="Nichos de onde você gostaria de receber oportunidades"
          options={CLIENT_TYPE_OPTIONS}
          defaultValues={clientTypes}
        />
        <ChipCheckboxGroup
          name="regions"
          label="Regiões onde você atua"
          options={REGION_OPTIONS}
          defaultValues={regions}
        />
        <ChipCheckboxGroup
          name="languages"
          label="Idiomas"
          options={LANGUAGE_OPTIONS}
          defaultValues={languages}
        />

        <label className={labelClass}>
          <span className={eyebrowClass}>Quantos artistas você consegue atender agora</span>
          <select
            name="capacity"
            defaultValue={capacity ?? ''}
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Prefiro não dizer</option>
            {CAPACITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>
        </label>

        <ChipCheckboxGroup
          name="feeRange"
          label="Faixas de cachê com as quais você gostaria de trabalhar"
          options={FEE_RANGE_OPTIONS}
          defaultValues={feeRange}
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={ghostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar perfil'}
        </button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
