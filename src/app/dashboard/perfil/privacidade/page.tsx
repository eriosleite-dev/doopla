import type { Metadata } from 'next';
import Link from 'next/link';

import { proGhostButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { ProSettingsDetailHeader, ProSettingsGroup, ProSettingsRow } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Privacidade e dados | Doopla',
};

// Settings V2 (08/09/2026) — não limitado a links legais: comporta
// política/termos, exportação de dados (quando existir) e encerramento
// de conta. Privacidade da Comunidade (community_profiles, show_*) tem
// tela própria, nunca duplicada aqui.
export default function PrivacidadePage() {
  return (
    <main>
      <ProSettingsDetailHeader title="Privacidade e dados" />

      <div className="flex flex-col gap-3.5">
        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Políticas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/privacidade" className={proGhostButtonClass}>
              Política de privacidade
            </Link>
            <Link href="/termos" className={proGhostButtonClass}>
              Termos de uso
            </Link>
          </div>
        </ProCard>

        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Seus dados</p>
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
            Exportação de dados ainda não está disponível — em breve. Sua privacidade dentro da Comunidade (o que aparece
            no seu perfil público) tem uma tela própria.
          </p>
          <Link href="/dashboard/perfil/editar" className={`${proGhostButtonClass} mt-3 inline-block`}>
            Editar perfil público
          </Link>
        </ProCard>

        <ProSettingsGroup title="Encerrar conta">
          <ProSettingsRow href="/dashboard/perfil/privacidade/excluir" label="Excluir minha conta" />
        </ProSettingsGroup>
      </div>
    </main>
  );
}
