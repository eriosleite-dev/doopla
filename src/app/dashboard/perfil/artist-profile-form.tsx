'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  buildRegionOptions,
  CAREER_STAGE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  FEE_RANGE_OPTIONS,
  HELP_AREA_OPTIONS,
  LANGUAGE_OPTIONS,
  WORK_TYPE_OPTIONS,
} from '@/lib/matching-options';

import { updateArtistProfileAction } from '../actions';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../ui';
import { ChipCheckboxGroup } from './chip-checkbox-group';
import { MatchingSummary, summarizeChips, type MatchingSummaryLine } from './matching-summary';

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
  local,
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
  local: string | null;
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
  const [editingPreferences, setEditingPreferences] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditingPreferences(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  const summaryLines: MatchingSummaryLine[] = [
    workTypes.length > 0 && { label: 'Tipos de trabalho', value: summarizeChips(workTypes) },
    clientTypes.length > 0 && {
      label: 'Tipos de cliente/evento',
      value: summarizeChips(clientTypes),
    },
    regions.length > 0 && { label: 'Área de atuação', value: summarizeChips(regions) },
    languages.length > 0 && { label: 'Idiomas', value: summarizeChips(languages) },
    helpAreas.length > 0 && {
      label: 'Precisa de ajuda com',
      value: summarizeChips(helpAreas),
    },
    careerStage && { label: 'Estágio de carreira', value: careerStage },
    feeRange && { label: 'Faixa de cachê', value: feeRange },
  ].filter((l): l is MatchingSummaryLine => Boolean(l));

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

      <div
        id="preferencias-matching"
        className="flex scroll-mt-6 flex-col gap-4 border-t border-[var(--ink)]/10 pt-4"
      >
        <div>
          <p className={eyebrowClass}>Preferências de matching</p>
          <p className="mt-1 text-[12.5px] text-[var(--ink)]/55">
            Usamos essas informações pra encontrar pessoas e oportunidades mais compatíveis com
            você.
          </p>
        </div>

        <MatchingSummary lines={summaryLines} />

        <button
          type="button"
          onClick={() => setEditingPreferences(true)}
          className={`${ghostButtonClass} w-fit`}
        >
          Editar preferências
        </button>
      </div>

      {/* Os campos continuam montados (só escondidos) pra não perder o
         que a pessoa está editando ao fechar sem salvar — o submit é o
         mesmo formulário de cima, não um formulário separado. */}
      <div
        className={
          editingPreferences
            ? 'fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 p-4'
            : 'hidden'
        }
      >
        <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-[20px] bg-[var(--paper)] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={eyebrowClass}>Editar preferências de matching</p>
            <button
              type="button"
              onClick={() => setEditingPreferences(false)}
              className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
            >
              Fechar
            </button>
          </div>

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
            options={buildRegionOptions(local)}
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

          <div className="flex flex-col gap-3 rounded-[14px] bg-[var(--paper-dim)] p-4">
            <p className={eyebrowClass}>Preferências comerciais</p>
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

          <button type="submit" disabled={pending} className={`${accentButtonClass} w-fit`}>
            {pending ? 'Salvando…' : 'Salvar preferências'}
          </button>
        </div>
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
