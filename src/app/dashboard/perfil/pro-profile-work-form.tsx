'use client';

import { useActionState, useState } from 'react';

import { updateProfileAndWorkContextAction } from '../actions';
import { ProCard } from '../pro-ui';
import { proGhostButtonClass, proInputClass, proLabelClass } from '../pro-format';
import { ProAvatarUploader } from './pro-avatar-uploader';

const labelClass = 'flex flex-col gap-1.5';
const helperClass = 'text-[12px] text-[var(--pro-tx-50)]';
// Título de grupo mais elegante (polimento visual, 15/09/2026, 2ª
// rodada) — antes era o mesmo estilo de label técnico de navegação
// (uppercase, tracking largo, cinza pequeno) usado em ProSettingsGroup
// pra LINHAS DE NAVEGAÇÃO; aqui é conteúdo de verdade, não navegação,
// então reaproveita o estilo de subtítulo já usado em "Foto"/
// "Preferências comerciais" (font-pro-sub, bold, cor off-white) — mais
// legível, ainda claramente menor que o título da página.
const sectionTitleClass = 'font-pro-sub text-[14px] font-bold text-[var(--pro-off)]';
const sectionDividerClass = 'border-t border-[var(--pro-line)] pt-6 mt-1';

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

// Redesign "Perfil e trabalho" (15/09/2026) — polimento visual de 2ª
// rodada, sobre a estrutura/campos já aprovados (não mexe em modelo de
// dados, actions/backend além de unificar as 2 actions antigas numa só
// — ver updateProfileAndWorkContextAction, único jeito seguro de ter 1
// CTA só sem risco de um campo zerar o outro). Substitui
// ProArtistIdentityForm + ProWorkContextForm (2 componentes, 2 forms, 2
// botões Salvar) por 1 componente, 1 form, 1 ProCard, 1 botão "Salvar
// alterações" — pedido explícito da fundadora: reduzir a sensação de
// "cards dentro de cards" e de formulário administrativo.
export function ProProfileWorkForm({
  avatarUrl,
  fallbackName,
  stageName,
  category,
  bio,
  whatYouDo,
  whereYouServe,
  baseFeeCents,
  pricingNotes,
  issuesInvoice,
}: {
  avatarUrl: string | null;
  fallbackName: string;
  stageName: string | null;
  category: string | null;
  bio: string | null;
  whatYouDo: string | null;
  whereYouServe: string | null;
  baseFeeCents: number | null;
  pricingNotes: string | null;
  issuesInvoice: boolean | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAndWorkContextAction, {});

  return (
    <form action={formAction}>
      <ProCard>
        <div className="flex flex-col gap-5">
          <p className={sectionTitleClass}>Informações profissionais</p>

          <ProAvatarUploader currentUrl={avatarUrl} fallbackName={fallbackName} />

          <div className="flex flex-col gap-4 sm:flex-row">
            <label className={`${labelClass} sm:max-w-[240px]`}>
              <span className={proLabelClass}>Nome artístico</span>
              <input type="text" name="stageName" defaultValue={stageName ?? ''} className={proInputClass} />
            </label>
            <label className={`${labelClass} sm:max-w-[240px]`}>
              <span className={proLabelClass}>Categoria</span>
              <input type="text" name="category" defaultValue={category ?? ''} className={proInputClass} />
            </label>
          </div>

          <label className={labelClass}>
            <span className={proLabelClass}>Bio</span>
            <textarea name="bio" rows={3} defaultValue={bio ?? ''} className={proInputClass} />
          </label>
        </div>

        <div className={`flex flex-col gap-5 ${sectionDividerClass}`}>
          <p className={sectionTitleClass}>Seu trabalho</p>

          <label className={labelClass}>
            <span className={proLabelClass}>Conte um pouco sobre o seu trabalho</span>
            <p className={helperClass}>Isso ajuda sua Doopla a entender quais trabalhos fazem sentido para você.</p>
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
            <p className={helperClass}>Onde você costuma aceitar trabalhos?</p>
            <textarea
              name="whereYouServe"
              rows={2}
              defaultValue={whereYouServe ?? ''}
              placeholder="Ex.: São Paulo e região. Também viajo para outros estados e países."
              className={proInputClass}
            />
          </label>
        </div>

        <div className={`flex flex-col gap-5 ${sectionDividerClass}`}>
          <p className={sectionTitleClass}>Valores e condições</p>

          <label className={`${labelClass} sm:max-w-[220px]`}>
            <span className={proLabelClass}>Cachê de referência</span>
            <p className={helperClass}>Qual valor sua Doopla pode usar como referência ao receber um novo pedido?</p>
            <div className={`${proInputClass} flex items-center gap-1.5`}>
              <span className="text-[var(--pro-tx-50)]">R$</span>
              <input
                type="text"
                inputMode="decimal"
                name="baseFee"
                defaultValue={baseFeeCents != null ? String(baseFeeCents / 100).replace('.', ',') : ''}
                placeholder="0,00"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </label>

          <label className={labelClass}>
            <span className={proLabelClass}>
              Informações extras sobre seu cachê{' '}
              <span className="font-normal normal-case text-[var(--pro-tx-30)]">(Opcional)</span>
            </span>
            <p className={helperClass}>Conte como você costuma calcular ou ajustar seu cachê.</p>
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

        <div className="mt-6 flex items-center gap-3 border-t border-[var(--pro-line)] pt-5">
          <button type="submit" disabled={pending} className={proGhostButtonClass}>
            {pending ? 'Salvando…' : 'Salvar alterações'}
          </button>
          {state.success && !pending && <p className="text-[13px] text-[var(--pro-green)]">Salvo ✓</p>}
          {state.error && <p className="text-[13px] text-[var(--pro-red)]">{state.error}</p>}
        </div>
      </ProCard>
    </form>
  );
}
