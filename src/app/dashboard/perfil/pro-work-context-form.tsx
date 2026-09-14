'use client';

import { useActionState } from 'react';

import {
  buildRegionOptions,
  CAREER_STAGE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  FEE_RANGE_OPTIONS,
  HELP_AREA_OPTIONS,
  LANGUAGE_OPTIONS,
  WORK_TYPE_OPTIONS,
} from '@/lib/matching-options';

import { updateArtistWorkContextAction } from '../actions';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';
import { ProChipCheckboxGroup } from './pro-chip-checkbox-group';
import { summarizeChips } from './matching-summary';

const labelClass = 'flex flex-col gap-1.5';

// Settings V2 consolidado (09/09/2026) — "Como você trabalha", um dos 3
// conceitos em que o antigo /dashboard/perfil/editar foi decomposto.
// Substitui o antigo modal "Preferências de matching" — mesmos campos,
// mesma coluna (artist_profiles), mesma action (updateArtistWorkContextAction,
// escopada só a estes campos em actions.ts), mas o conceito de produto
// "matching" (buscas/recomendações/compatibilidade entre pessoas) não
// existe mais. Estes dados servem só pra ajudar sua Doopla a entender
// como o profissional trabalha e representá-lo melhor nas conversas —
// nunca pra "encontrar" o profissional em algum lugar. Agora é uma
// página normal (detalhe → ação), nunca mais um modal escondido atrás
// de um botão "Editar preferências".
export function ProWorkContextForm({
  local,
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
  issuesInvoice,
}: {
  local: string | null;
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
  issuesInvoice: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updateArtistWorkContextAction, {});

  const summaryLines = [
    workTypes.length > 0 && { label: 'Tipos de trabalho', value: summarizeChips(workTypes) },
    clientTypes.length > 0 && { label: 'Tipos de cliente/evento', value: summarizeChips(clientTypes) },
    regions.length > 0 && { label: 'Área de atuação', value: summarizeChips(regions) },
    languages.length > 0 && { label: 'Idiomas', value: summarizeChips(languages) },
    helpAreas.length > 0 && { label: 'Precisa de ajuda com', value: summarizeChips(helpAreas) },
    careerStage && { label: 'Estágio de carreira', value: careerStage },
    feeRange && { label: 'Faixa de cachê', value: feeRange },
  ].filter((l): l is { label: string; value: string } => Boolean(l));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {summaryLines.length === 0 ? (
        <p className="text-[13px] text-[var(--pro-tx-50)]">
          Nada preenchido ainda. Quanto mais contexto sua Doopla tiver sobre o seu trabalho, melhor
          ela consegue te representar.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 border-b border-[var(--pro-line)] pb-5 sm:grid-cols-2">
          {summaryLines.map((line) => (
            <div key={line.label} className="flex flex-col gap-0.5">
              <span className={proLabelClass}>{line.label}</span>
              <span className="text-[13px] text-[var(--pro-off)]">{line.value}</span>
            </div>
          ))}
        </div>
      )}

      <ProChipCheckboxGroup
        name="workTypes"
        label="Tipos de trabalho que você costuma fazer"
        options={WORK_TYPE_OPTIONS}
        defaultValues={workTypes}
      />
      <ProChipCheckboxGroup
        name="clientTypes"
        label="Tipos de cliente ou evento que você atende"
        options={CLIENT_TYPE_OPTIONS}
        defaultValues={clientTypes}
      />
      <ProChipCheckboxGroup
        name="regions"
        label="Regiões onde você atua"
        options={buildRegionOptions(local)}
        defaultValues={regions}
      />
      <ProChipCheckboxGroup
        name="languages"
        label="Idiomas"
        options={LANGUAGE_OPTIONS}
        defaultValues={languages}
      />
      <ProChipCheckboxGroup
        name="helpAreas"
        label="Em quais atividades você precisa de ajuda"
        options={HELP_AREA_OPTIONS}
        defaultValues={helpAreas}
      />

      <label className={labelClass}>
        <span className={proLabelClass}>Estágio de carreira / volume de trabalhos</span>
        <select name="careerStage" defaultValue={careerStage ?? ''} className={proInputClass}>
          <option value="">Prefiro não dizer</option>
          {CAREER_STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4">
        <p className="font-pro-sub text-[13.5px] font-bold">Preferências comerciais</p>
        <label className={labelClass}>
          <span className={proLabelClass}>Faixa de cachê ou ticket médio</span>
          <select name="feeRange" defaultValue={feeRange ?? ''} className={proInputClass}>
            <option value="">Prefiro não dizer</option>
            {FEE_RANGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={proLabelClass}>Você emite nota fiscal?</span>
          <select
            name="issuesInvoice"
            defaultValue={issuesInvoice === null ? '' : String(issuesInvoice)}
            className={proInputClass}
          >
            <option value="">Prefiro não dizer</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4">
        <label className="flex items-center gap-2.5 text-[13px] text-[var(--pro-tx-70)]">
          <input type="checkbox" name="travels" defaultChecked={travels} className="h-4 w-4" />
          Viajo para trabalhar
        </label>
        <label className="flex items-center gap-2.5 text-[13px] text-[var(--pro-tx-70)]">
          <input
            type="checkbox"
            name="servesOtherLocations"
            defaultChecked={servesOtherLocations}
            className="h-4 w-4"
          />
          Atendo clientes de outras cidades
        </label>
        <label className="flex items-center gap-2.5 text-[13px] text-[var(--pro-tx-70)]">
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
        <span className={proLabelClass}>Outras preferências</span>
        <textarea
          name="otherPreferences"
          rows={2}
          defaultValue={otherPreferences ?? ''}
          className={proInputClass}
        />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proGhostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
