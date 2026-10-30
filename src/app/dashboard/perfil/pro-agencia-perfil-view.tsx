import { proLabelClass } from '../pro-format';
import { ProCard, ProPageHeader } from '../pro-ui';
import { ProAvatarUploader } from './pro-avatar-uploader';
import type { AgencyDetails } from './page';

// Bloco 7, P1 (item 2/N, 09/09/2026) — branch Pro dedicado pra
// `agencia`, que até aqui caía no mesmo JSX legado do Booker em
// perfil/page.tsx (clash: shell escuro do layout.tsx + card branco
// legado por dentro). Mesma estrutura/conteúdo de sempre (Conta, Foto,
// dados da agência, "Respostas do cadastro" — inclusive a duplicação
// dessas mesmas respostas nas duas seções, que já existia no legado e
// não foi alterada aqui, só reestilizada), só o tema --pro-*. Booker
// não é afetado: seu branch em page.tsx continua exatamente onde
// estava, agora só alcançado depois que artista/agencia retornam cedo.
export function ProAgenciaPerfilView({
  fullName,
  email,
  avatarUrl,
  details,
}: {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  details: AgencyDetails | null;
}) {
  return (
    <main>
      <ProPageHeader title={fullName || email} subtitle="Perfil" />

      <div className="flex flex-col gap-6">
        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Conta</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className={proLabelClass}>E-mail</dt>
            <dd className="text-[var(--pro-off)]">{email}</dd>
            <dt className={proLabelClass}>Tipo de conta</dt>
            <dd className="text-[var(--pro-off)]">Agência</dd>
          </dl>
        </ProCard>

        <div className="flex flex-col gap-3.5">
          <div className="px-1">
            <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--pro-tx-30)]">
              Perfil público
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">
              O que aparece pra clientes e bookers quando alguém vê seu link ou perfil.
            </p>
          </div>

          <ProCard>
            <p className="font-pro-sub text-[13.5px] font-bold">Foto</p>
            <div className="mt-4">
              <ProAvatarUploader currentUrl={avatarUrl} fallbackName={fullName} />
            </div>
          </ProCard>

          <ProCard>
            <AgencyDetailsDl details={details} />
          </ProCard>
        </div>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Respostas do cadastro</p>
          <div className="mt-4">
            <AgencyDetailsDl details={details} />
          </div>
        </ProCard>
      </div>
    </main>
  );
}

function AgencyDetailsDl({ details }: { details: AgencyDetails | null }) {
  if (!details) {
    return <p className="text-[13px] text-[var(--pro-tx-50)]">Nenhum dado adicional preenchido ainda.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      <dt className={proLabelClass}>Agência</dt>
      <dd className="text-[var(--pro-off)]">{details.agency_name}</dd>
      <dt className={proLabelClass}>Nº de artistas</dt>
      <dd className="text-[var(--pro-off)]">{details.roster || '—'}</dd>
      <dt className={proLabelClass}>Nº de agentes</dt>
      <dd className="text-[var(--pro-off)]">{details.agentes || '—'}</dd>
      <dt className={proLabelClass}>Principal mercado</dt>
      <dd className="text-[var(--pro-off)]">{details.mercado || '—'}</dd>
    </dl>
  );
}
