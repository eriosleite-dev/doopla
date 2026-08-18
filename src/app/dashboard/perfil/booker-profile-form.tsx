'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  ARTIST_CATEGORY_OPTIONS,
  buildRegionOptions,
  CAPACITY_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  COMMISSION_RANGE_OPTIONS,
  FEE_RANGE_OPTIONS,
  LANGUAGE_OPTIONS,
  SPECIALTY_AREA_OPTIONS,
} from '@/lib/matching-options';

import { updateBookerProfileAction } from '../actions';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../ui';
import { ChipCheckboxGroup } from './chip-checkbox-group';
import { MatchingSummary, summarizeChips, type MatchingSummaryLine } from './matching-summary';

const inputClass =
  'rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const textareaClass =
  'rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm';
const labelClass = 'flex flex-col gap-1.5';

export function BookerProfileForm({
  professionalName,
  bio,
  mercados,
  cidades,
  experience,
  instagramUrl,
  websiteUrl,
  capacity,
  feeRange,
  commissionRange,
  artistCategories,
  clientTypes,
  regions,
  languages,
  specialtyAreas,
}: {
  professionalName: string | null;
  bio: string | null;
  mercados: string | null;
  cidades: string | null;
  experience: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  capacity: string | null;
  feeRange: string[];
  commissionRange: string | null;
  artistCategories: string[];
  clientTypes: string[];
  regions: string[];
  languages: string[];
  specialtyAreas: string[];
}) {
  const [state, formAction, pending] = useActionState(updateBookerProfileAction, {});
  const [editingPreferences, setEditingPreferences] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditingPreferences(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  const summaryLines: MatchingSummaryLine[] = [
    specialtyAreas.length > 0 && { label: 'Especialidades', value: summarizeChips(specialtyAreas) },
    artistCategories.length > 0 && {
      label: 'Artistas com quem trabalha',
      value: summarizeChips(artistCategories),
    },
    clientTypes.length > 0 && {
      label: 'Oportunidades de interesse',
      value: summarizeChips(clientTypes),
    },
    regions.length > 0 && { label: 'Área de atuação', value: summarizeChips(regions) },
    languages.length > 0 && { label: 'Idiomas', value: summarizeChips(languages) },
    capacity && { label: 'Disponibilidade atual', value: `Até ${capacity} artistas` },
    (feeRange.length > 0 || commissionRange) && {
      label: 'Preferências comerciais',
      value: [
        feeRange.length > 0 && `Cachês de interesse: ${summarizeChips(feeRange)}`,
        commissionRange && `Comissão praticada: ${commissionRange}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ].filter((l): l is MatchingSummaryLine => Boolean(l));

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
            options={buildRegionOptions(cidades)}
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

          <div className="flex flex-col gap-3 rounded-[14px] bg-[var(--paper-dim)] p-4">
            <p className={eyebrowClass}>Preferências comerciais</p>
            <ChipCheckboxGroup
              name="feeRange"
              label="Faixas de cachê com as quais você gostaria de trabalhar"
              options={FEE_RANGE_OPTIONS}
              defaultValues={feeRange}
            />
            <label className={labelClass}>
              <span className={eyebrowClass}>
                Faixa de comissão que você costuma ou pretende praticar
              </span>
              <select
                name="commissionRange"
                defaultValue={commissionRange ?? ''}
                className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
              >
                <option value="">Prefiro não dizer</option>
                {COMMISSION_RANGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <p className="text-[12px] text-[var(--ink)]/50">
                É só indicativo pro seu perfil — nunca trava a comissão de um booking específico.
              </p>
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
