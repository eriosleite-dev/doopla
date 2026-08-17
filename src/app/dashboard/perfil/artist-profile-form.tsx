'use client';

import { useActionState } from 'react';

import {
  CAREER_STAGE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  FEE_RANGE_OPTIONS,
  HELP_AREA_OPTIONS,
  LANGUAGE_OPTIONS,
  REGION_OPTIONS,
  WORK_TYPE_OPTIONS,
} from '@/lib/matching-options';

import { updateArtistProfileAction } from '../actions';
import { eyebrowClass, ghostButtonClass } from '../ui';
import { ChipCheckboxGroup } from './chip-checkbox-group';

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
  careerStage,
  feeRange,
  workTypes,
  clientTypes,
  regions,
  languages,
  helpAreas,
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
  careerStage: string | null;
  feeRange: string | null;
  workTypes: string[];
  clientTypes: string[];
  regions: string[];
  languages: string[];
  helpAreas: string[];
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

      <div className="flex flex-col gap-4 border-t border-[var(--ink)]/10 pt-4">
        <p className="text-[12.5px] text-[var(--ink)]/55">
          Os campos abaixo alimentam o matching com bookers — usados pra te encontrar em buscas e
          sugestões, não aparecem soltos no seu perfil público.
        </p>
        <ChipCheckboxGroup
          name="workTypes"
          label="Tipos de trabalho que você costuma fazer"
          options={WORK_TYPE_OPTIONS}
          defaultValues={workTypes}
        />
        <ChipCheckboxGroup
          name="clientTypes"
          label="Tipos de cliente ou evento que você atende"
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
        <ChipCheckboxGroup
          name="helpAreas"
          label="Em quais atividades você precisa de ajuda"
          options={HELP_AREA_OPTIONS}
          defaultValues={helpAreas}
        />

        <label className={labelClass}>
          <span className={eyebrowClass}>Estágio de carreira / volume de trabalhos</span>
          <select
            name="careerStage"
            defaultValue={careerStage ?? ''}
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Prefiro não dizer</option>
            {CAREER_STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          <span className={eyebrowClass}>Faixa de cachê ou ticket médio</span>
          <select
            name="feeRange"
            defaultValue={feeRange ?? ''}
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Prefiro não dizer</option>
            {FEE_RANGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
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
