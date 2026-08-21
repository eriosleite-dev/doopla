'use client';

import { useActionState, useState } from 'react';

import { chipClass, fieldInputClass, fieldLabelClass, primaryButtonClass } from '@/app/auth/ui';
import { WORK_REGIONS } from '@/lib/artist-categories';
import type { Profession, ProfessionJobType } from '@/lib/supabase/types';
import { savePrepareAction, type OnboardingFormState } from '../actions';

const initialState: OnboardingFormState = {};
const TOTAL_STEPS = 5;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function PrepareForm({
  professions,
  jobTypes,
  initialStageName,
  initialCategory,
  initialLocal,
  initialRegions,
  initialWorkTypes,
  initialInstagramUrl,
  initialPortfolioUrl,
  initialWebsiteUrl,
  initialOtherLinks,
  initialBio,
}: {
  professions: Profession[];
  jobTypes: ProfessionJobType[];
  initialStageName: string;
  initialCategory: string;
  initialLocal: string;
  initialRegions: string[];
  initialWorkTypes: string[];
  initialInstagramUrl: string;
  initialPortfolioUrl: string;
  initialWebsiteUrl: string;
  initialOtherLinks: string;
  initialBio: string;
}) {
  const [state, formAction, pending] = useActionState(savePrepareAction, initialState);
  const [step, setStep] = useState(0);

  const [stageName, setStageName] = useState(initialStageName);
  const [category, setCategory] = useState<string>(initialCategory);
  const [local, setLocal] = useState(initialLocal);
  const [regions, setRegions] = useState<string[]>(initialRegions);
  const [workTypes, setWorkTypes] = useState<string[]>(initialWorkTypes);
  const [instagramUrl, setInstagramUrl] = useState(initialInstagramUrl);
  const [portfolioUrl, setPortfolioUrl] = useState(initialPortfolioUrl);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [otherLinks, setOtherLinks] = useState(initialOtherLinks);
  const [bio, setBio] = useState(initialBio);

  const workTypeOptions = jobTypes.filter((jt) => jt.profession_id === category);
  const hasAnyLink = Boolean(instagramUrl || portfolioUrl || websiteUrl || otherLinks);

  const canAdvance =
    (step === 0 && stageName.trim() && category) ||
    (step === 1 && local.trim()) ||
    step === 2 ||
    (step === 3 && hasAnyLink) ||
    (step === 4 && bio.trim());

  function next() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="font-doopla-mono text-[11px] uppercase tracking-[.1em] text-[var(--ink)]/45">
          Pergunta {step + 1} de {TOTAL_STEPS}
        </span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--paper-dim)]">
          <div
            className="h-full rounded-full bg-[var(--ink)] transition-all"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Nome artístico/profissional</span>
            <span className="text-xs text-[var(--ink)]/50">
              Como você deve ser apresentado(a) aos clientes.
            </span>
            <input
              type="text"
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              className={fieldInputClass}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>O que você faz?</span>
            <div className="flex flex-wrap gap-2">
              {professions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={chipClass(category === c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Onde você está?</span>
            <span className="text-xs text-[var(--ink)]/50">Cidade/base principal.</span>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex: São Paulo, SP"
              className={fieldInputClass}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Onde você trabalha?</span>
            <div className="flex flex-wrap gap-2">
              {WORK_REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegions((prev) => toggle(prev, r))}
                  className={chipClass(regions.includes(r))}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Que tipos de trabalho você faz?</span>
          <div className="flex flex-wrap gap-2">
            {workTypeOptions.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWorkTypes((prev) => toggle(prev, w.label))}
                className={chipClass(workTypes.includes(w.label))}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <span className={fieldLabelClass}>Presença profissional</span>
          <span className="text-xs text-[var(--ink)]/50">
            Pelo menos um link — Instagram, site, portfólio ou outra rede relevante.
          </span>
          <input
            type="text"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="Instagram"
            className={fieldInputClass}
          />
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="Site"
            className={fieldInputClass}
          />
          <input
            type="text"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            placeholder="Portfólio"
            className={fieldInputClass}
          />
          <input
            type="text"
            value={otherLinks}
            onChange={(e) => setOtherLinks(e.target.value)}
            placeholder="Outra rede relevante"
            className={fieldInputClass}
          />
        </div>
      )}

      {step === 4 && (
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>
            Que tipo de trabalho você mais faz ou gostaria de receber?
          </span>
          <span className="text-xs text-[var(--ink)]/50">
            Conte do seu jeito — sua Doopla usa isso para entender seu trabalho e as
            oportunidades que chegam até você.
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="Ex: Sou fotógrafa de moda e também faço campanhas para marcas."
            className={fieldInputClass}
          />
        </label>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="text-xs font-medium text-[var(--ink)]/50 underline underline-offset-2"
          >
            Voltar
          </button>
        ) : (
          <span />
        )}

        {step < TOTAL_STEPS - 1 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={next}
            className={primaryButtonClass}
          >
            Continuar
          </button>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="stageName" value={stageName} />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="local" value={local} />
            {regions.map((r) => (
              <input key={r} type="hidden" name="regions" value={r} />
            ))}
            {workTypes.map((w) => (
              <input key={w} type="hidden" name="workTypes" value={w} />
            ))}
            <input type="hidden" name="instagramUrl" value={instagramUrl} />
            <input type="hidden" name="portfolioUrl" value={portfolioUrl} />
            <input type="hidden" name="websiteUrl" value={websiteUrl} />
            <input type="hidden" name="otherLinks" value={otherLinks} />
            <input type="hidden" name="bio" value={bio} />
            <button type="submit" disabled={pending || !canAdvance} className={primaryButtonClass}>
              {pending ? 'Salvando…' : 'Continuar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
