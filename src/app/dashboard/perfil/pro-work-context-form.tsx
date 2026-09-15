'use client';

import { useActionState, useState } from 'react';

import { updateArtistWorkContextAction } from '../actions';
import { ProCard } from '../pro-ui';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';

const labelClass = 'flex flex-col gap-1.5';
const groupLabelClass = 'px-1 text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--pro-tx-30)]';

function InvoiceToggle({ initial }: { initial: boolean | null }) {
  const [value, setValue] = useState<boolean | null>(initial);
  return (
    <div className={labelClass}>
      <span className={proLabelClass}>Você emite nota fiscal?</span>
      <input type="hidden" name="issuesInvoice" value={value === null ? '' : String(value)} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setValue(true)}
          className={`font-pro-sub rounded-full border px-5 py-2 text-[13px] font-bold transition-colors ${
            value === true
              ? 'border-[var(--pro-red)] bg-[var(--pro-red)] text-[var(--pro-off)]'
              : 'border-[var(--pro-line)] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]'
          }`}
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => setValue(false)}
          className={`font-pro-sub rounded-full border px-5 py-2 text-[13px] font-bold transition-colors ${
            value === false
              ? 'border-[var(--pro-red)] bg-[var(--pro-red)] text-[var(--pro-off)]'
              : 'border-[var(--pro-line)] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]'
          }`}
        >
          Não
        </button>
      </div>
    </div>
  );
}

// Redesign "Perfil e trabalho" (15/09/2026) — grupos "Seu trabalho" e
// "Valores e condições". Substitui o antigo modal "Preferências de
// matching" (e depois a 1ª versão da Settings V2, 09/09/2026) — mesma
// tabela (artist_profiles), mesma action, conceito de "matching" não
// existe mais no produto.
//
// "Seu trabalho": whatYouDo/whereYouServe (texto livre, migration
// 0080) sem mudança de campo, só copy mais natural (achado da
// fundadora: as perguntas anteriores pareciam questionário de
// classificação, não conversa).
//
// "Valores e condições": até esta rodada a UI editava `fee_range`
// (dropdown de faixas fixas, "isso é o que alimenta o matching" —
// comentário original de matching-options.ts) com "Prefiro não dizer".
// Auditoria (15/09/2026) encontrou 2 colunas canônicas já existentes e
// órfãs desde 07/09/2026 (removidas do onboarding, nunca trazidas pra
// Settings V2): `base_fee_cents` (valor fixo, migration 0001) e
// `pricing_notes` (texto livre, "como você costuma definir seus
// valores... quando escolhe 'depende do trabalho'", migration 0038) —
// exatamente o par que "Cachê de referência" + "Informações extras
// sobre seu cachê" precisa. Nenhuma migration nova. `fee_range` para
// de ser editado aqui (coluna preservada, vira legado — ver
// updateArtistWorkContextAction) e `get-professional-business-context.ts`
// passa a expor `baseFeeCents` como fonte primária pro Intelligence
// Context (fallback pra `feeRange` só quando `baseFeeCents` for nulo,
// pra profissional que preencheu a faixa entre 09/09 e 15/09 não
// perder contexto já declarado).
//
// "Você emite nota fiscal?" vira 2 botões visíveis (Sim/Não, sem
// dropdown, sem 3ª opção) — mesma coluna `issues_invoice`, sem estado
// "prefiro não dizer": ausência de resposta agora é só "nenhum dos
// dois botões apertado ainda", nunca uma opção própria.
export function ProWorkContextForm({
  whatYouDo,
  whereYouServe,
  baseFeeCents,
  pricingNotes,
  issuesInvoice,
}: {
  whatYouDo: string | null;
  whereYouServe: string | null;
  baseFeeCents: number | null;
  pricingNotes: string | null;
  issuesInvoice: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updateArtistWorkContextAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <p className={groupLabelClass}>Seu trabalho</p>
      <ProCard>
        <div className="flex flex-col gap-5">
          <label className={labelClass}>
            <span className={proLabelClass}>Conte um pouco sobre o seu trabalho</span>
            <p className="text-[12px] text-[var(--pro-tx-50)]">
              Isso ajuda sua Doopla a entender quais trabalhos fazem sentido para você.
            </p>
            <textarea
              name="whatYouDo"
              rows={2}
              defaultValue={whatYouDo ?? ''}
              placeholder="Ex.: Sou DJ e trabalho principalmente com eventos de marcas, festas privadas e casamentos."
              className={proInputClass}
            />
          </label>

          <label className={labelClass}>
            <span className={proLabelClass}>Região que atende</span>
            <p className="text-[12px] text-[var(--pro-tx-50)]">Onde você costuma aceitar trabalhos?</p>
            <textarea
              name="whereYouServe"
              rows={2}
              defaultValue={whereYouServe ?? ''}
              placeholder="Ex.: São Paulo e região. Também viajo para outros estados e países."
              className={proInputClass}
            />
          </label>
        </div>
      </ProCard>

      <p className={groupLabelClass}>Valores e condições</p>
      <ProCard>
        <div className="flex flex-col gap-5">
          <label className={labelClass}>
            <span className={proLabelClass}>Cachê de referência</span>
            <p className="text-[12px] text-[var(--pro-tx-50)]">
              Qual valor sua Doopla pode usar como referência ao receber um novo pedido?
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] text-[var(--pro-tx-50)]">R$</span>
              <input
                type="text"
                inputMode="decimal"
                name="baseFee"
                defaultValue={baseFeeCents != null ? String(baseFeeCents / 100).replace('.', ',') : ''}
                placeholder="0,00"
                className={proInputClass}
              />
            </div>
          </label>

          <label className={labelClass}>
            <span className={proLabelClass}>
              Informações extras sobre seu cachê{' '}
              <span className="font-normal normal-case text-[var(--pro-tx-30)]">(Opcional)</span>
            </span>
            <p className="text-[12px] text-[var(--pro-tx-50)]">Conte como você costuma calcular ou ajustar seu cachê.</p>
            <textarea
              name="pricingNotes"
              rows={2}
              defaultValue={pricingNotes ?? ''}
              placeholder="Ex.: R$ 1.000 por hora, mínimo de 3 horas. Para trabalhos fora de São Paulo, acrescento deslocamento e hospedagem."
              className={proInputClass}
            />
          </label>

          <InvoiceToggle initial={issuesInvoice} />
        </div>
      </ProCard>

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
