'use client';

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

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
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from '../pro-format';
import { ProChipCheckboxGroup } from './pro-chip-checkbox-group';
import { ProMatchingSummary } from './pro-matching-summary';
import { summarizeChips, type MatchingSummaryLine } from './matching-summary';

const labelClass = 'flex flex-col gap-1.5';

// Pro re-skin (Bloco 7, P1) de ArtistProfileForm — mesma action/lógica/
// campos/validação, só o tema --pro-*. O id="preferencias-matching" é
// preservado igual ao original: perfil/preferencias/page.tsx já linka
// pra cá com esse anchor (`/dashboard/perfil/editar#preferencias-matching`).
export function ProArtistProfileForm({
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
  issuesInvoice,
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
  issuesInvoice: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updateArtistProfileAction, {});
  const [editingPreferences, setEditingPreferences] = useState(false);
  const wasPending = useRef(false);
  const formId = useId();

  // Portal pro <body> — o modal precisa cobrir a viewport inteira, mas
  // este form vive dentro de um ProCard (`backdrop-blur-xl`), que cria
  // containing block pra descendentes fixed (comportamento do Chromium
  // pra backdrop-filter, igual a filter/transform) — sem o portal, o
  // overlay ficava preso dentro dos limites do card em vez de cobrir a
  // tela. O original (cardClass, sem backdrop-filter) nunca teve esse
  // problema. `mounted` via useSyncExternalStore (não useEffect+setState,
  // que a régua de lint do projeto proíbe) — false no SSR/primeiro
  // render do cliente, true depois, sem risco de mismatch de hidratação
  // (`document.body` não existe no servidor).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

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
    <form id={formId} action={formAction} className="flex flex-col gap-4">
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

      <div
        id="preferencias-matching"
        className="flex scroll-mt-6 flex-col gap-4 border-t border-[var(--pro-line)] pt-4"
      >
        <div>
          <p className="font-pro-sub text-[13.5px] font-bold">Preferências de matching</p>
          <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">
            Usamos essas informações pra encontrar pessoas e oportunidades mais compatíveis com
            você.
          </p>
        </div>

        <ProMatchingSummary lines={summaryLines} />

        <button
          type="button"
          onClick={() => setEditingPreferences(true)}
          className={`${proGhostButtonClass} w-fit`}
        >
          Editar preferências
        </button>
      </div>

      {/* Os campos continuam montados (só escondidos, via portal pro
         <body> — ver useEffect(setMounted) acima) pra não perder o que
         a pessoa está editando ao fechar sem salvar — o submit é o
         mesmo formulário de cima, não um formulário separado. */}
      {mounted &&
        createPortal(
          <div
            className={
              editingPreferences
                ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
                : 'hidden'
            }
          >
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-[20px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-pro-sub text-[13.5px] font-bold">Editar preferências de matching</p>
                <button
                  type="button"
                  onClick={() => setEditingPreferences(false)}
                  className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
                >
                  Fechar
                </button>
              </div>

              <ProChipCheckboxGroup
                name="workTypes"
                label="Tipos de trabalho que você costuma fazer"
                options={WORK_TYPE_OPTIONS}
                defaultValues={workTypes}
                form={formId}
              />
              <ProChipCheckboxGroup
                name="clientTypes"
                label="Tipos de cliente ou evento que você atende"
                options={CLIENT_TYPE_OPTIONS}
                defaultValues={clientTypes}
                form={formId}
              />
              <ProChipCheckboxGroup
                name="regions"
                label="Regiões onde você atua"
                options={buildRegionOptions(local)}
                defaultValues={regions}
                form={formId}
              />
              <ProChipCheckboxGroup
                name="languages"
                label="Idiomas"
                options={LANGUAGE_OPTIONS}
                defaultValues={languages}
                form={formId}
              />
              <ProChipCheckboxGroup
                name="helpAreas"
                label="Em quais atividades você precisa de ajuda"
                options={HELP_AREA_OPTIONS}
                defaultValues={helpAreas}
                form={formId}
              />

              <label className={labelClass}>
                <span className={proLabelClass}>Estágio de carreira / volume de trabalhos</span>
                <select name="careerStage" defaultValue={careerStage ?? ''} form={formId} className={proInputClass}>
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
                  <select name="feeRange" defaultValue={feeRange ?? ''} form={formId} className={proInputClass}>
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
                    form={formId}
                    className={proInputClass}
                  >
                    <option value="">Prefiro não dizer</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </label>
              </div>

              <button type="submit" form={formId} disabled={pending} className={`${proPrimaryButtonClass} w-fit`}>
                {pending ? 'Salvando…' : 'Salvar preferências'}
              </button>
            </div>
          </div>,
          document.body
        )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={proGhostButtonClass}>
          {pending ? 'Salvando…' : 'Salvar perfil'}
        </button>
        {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
