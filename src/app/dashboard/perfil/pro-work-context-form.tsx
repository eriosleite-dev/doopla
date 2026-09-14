'use client';

import { useActionState } from 'react';

import { FEE_RANGE_OPTIONS } from '@/lib/matching-options';

import { updateArtistWorkContextAction } from '../actions';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';

const labelClass = 'flex flex-col gap-1.5';

// Settings V2 consolidado (09/09/2026) — "Como você trabalha", um dos 3
// conceitos em que o antigo /dashboard/perfil/editar foi decomposto.
// Substitui o antigo modal "Preferências de matching" — mesma coluna
// (artist_profiles), mesma action (updateArtistWorkContextAction), mas
// o conceito de produto "matching" (buscas/recomendações/
// compatibilidade entre pessoas) não existe mais. Estes dados servem só
// pra ajudar sua Doopla a entender como o profissional trabalha e
// representá-lo melhor nas conversas — nunca pra "encontrar" o
// profissional em algum lugar.
//
// Simplificação de beta (14/09/2026) — os 5 grupos de chips
// (work_types/client_types/regions/languages/help_areas), career_stage
// e os 3 booleans de disponibilidade pra viagem saíram: auditoria
// confirmou que o Intelligence Context só consumia esses arrays como
// texto narrativo simples (nunca filtro/ranking), então dois campos de
// texto livre entregam a mesma informação sem parecer um formulário de
// matching. Colunas antigas preservadas no banco, só não editáveis
// aqui — ver updateArtistWorkContextAction.
export function ProWorkContextForm({
  whatYouDo,
  whereYouServe,
  otherPreferences,
  feeRange,
  issuesInvoice,
}: {
  whatYouDo: string | null;
  whereYouServe: string | null;
  otherPreferences: string | null;
  feeRange: string | null;
  issuesInvoice: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updateArtistWorkContextAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className={labelClass}>
        <span className={proLabelClass}>O que você faz e para quem?</span>
        <textarea
          name="whatYouDo"
          rows={2}
          defaultValue={whatYouDo ?? ''}
          placeholder="Ex.: Sou DJ e trabalho com eventos de marcas, casamentos e festas privadas."
          className={proInputClass}
        />
      </label>

      <label className={labelClass}>
        <span className={proLabelClass}>Onde você atende?</span>
        <textarea
          name="whereYouServe"
          rows={2}
          defaultValue={whereYouServe ?? ''}
          placeholder="Ex.: São Paulo e outras cidades. Também viajo para trabalhos em outros estados e países."
          className={proInputClass}
        />
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
        {state.success && !pending && <p className="text-[13px] text-[var(--pro-green)]">Salvo ✓</p>}
        {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
      </div>
    </form>
  );
}
