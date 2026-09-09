import type { Metadata } from 'next';
import Link from 'next/link';

import { getMyCommunityProfile } from '@/lib/community/data';

import { proGhostButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProSettingsDetailHeader, ProSettingsGroup, ProSettingsRow } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Privacidade e dados | Doopla',
};

const COMMUNITY_TOGGLE_COUNT = 7;

// Settings V2 (08/09/2026) — não limitado a links legais: comporta
// política/termos, exportação de dados (quando existir) e encerramento
// de conta.
//
// Bloco 7, P1 (09/09/2026) — o grupo "Comunidade" abaixo linka pra
// tela real de privacidade da Comunidade (perfil/privacidade/comunidade),
// que até aqui não existia: esta página prometia "uma tela própria"
// e linkava por engano pro editor de perfil profissional geral
// (achado registrado em DECISOES.md). Comunidade V1 é artista-only —
// o grupo só aparece pra quem é artista, mesmo padrão já usado em
// perfil/preferencias/page.tsx, pra não deixar um link morto pra
// booker/agencia (que nunca alcançam esta rota via navegação normal,
// mas a rota em si não tem guard de role).
export default async function PrivacidadePage() {
  const { supabase, profile } = await getSessionProfile();

  const communityProfile = profile.role === 'artista' ? await getMyCommunityProfile(supabase) : null;
  const communityVisibleCount = communityProfile
    ? [
        communityProfile.showCity,
        communityProfile.showAvatar,
        communityProfile.showBio,
        communityProfile.showSpecialties,
        communityProfile.showWorkTypes,
        communityProfile.showInstagram,
        communityProfile.showPortfolio,
      ].filter(Boolean).length
    : null;

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
          <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">Exportação de dados ainda não está disponível — em breve.</p>
        </ProCard>

        {profile.role === 'artista' && (
          <ProSettingsGroup title="Comunidade">
            <ProSettingsRow
              href="/dashboard/perfil/privacidade/comunidade"
              label="Privacidade na Comunidade"
              summary={
                communityVisibleCount === null
                  ? undefined
                  : communityVisibleCount === 0
                    ? 'Nada visível ainda'
                    : `${communityVisibleCount} de ${COMMUNITY_TOGGLE_COUNT} visíveis`
              }
            />
          </ProSettingsGroup>
        )}

        <ProSettingsGroup title="Encerrar conta">
          <ProSettingsRow href="/dashboard/perfil/privacidade/excluir" label="Excluir minha conta" />
        </ProSettingsGroup>
      </div>
    </main>
  );
}
