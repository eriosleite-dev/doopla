import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyCommunityProfile } from '@/lib/community/data';

import { ProCard } from '../../../pro-ui';
import { getSessionProfile } from '../../../session';
import { ProSettingsDetailHeader } from '../../settings-ui';
import { CommunityPrivacyForm } from './community-privacy-form';

export const metadata: Metadata = {
  title: 'Privacidade na Comunidade | Doopla',
};

// Bloco 7, P1 — feature nova, não re-skin. Os 7 controles de
// visibilidade de community_profiles (migration 0059) já tinham
// schema/RLS/RPC prontos (update_community_profile) e a camada de
// dados já existia (getMyCommunityProfile/updateCommunityProfile em
// src/lib/community/data.ts) — só nunca ganharam UI em lugar nenhum.
// perfil/privacidade/page.tsx prometia "uma tela própria" e linkava
// por engano pro editor de perfil profissional geral. Esta é a tela
// que faltava.
//
// Artista-only, mesmo escopo do resto da Comunidade V1
// (activate_community_profile recusa role != 'artista' internamente,
// comentário original em src/lib/community/data.ts) — redirect
// silencioso pro hub de privacidade pra quem não é artista, sem
// expor um link morto lá.
export default async function ComunidadePrivacidadePage() {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil/privacidade');

  // Correção 14/09/2026 (achado da fundadora durante a Categoria B):
  // visualizar/carregar as próprias preferências NUNCA pode ativar
  // participação sozinho — só a leitura pura (getMyCommunityProfile),
  // nunca ensureCommunityProfileActivated aqui. Quem nunca entrou na
  // Comunidade vê os 7 toggles todos desmarcados (estado inicial real,
  // não fabricado); a ativação só acontece dentro de
  // updateCommunityPrivacyAction, no momento em que o profissional de
  // fato salva uma preferência — a ação explícita que conta como
  // "participar", nunca abrir a tela pra olhar.
  const communityProfile = await getMyCommunityProfile(supabase);

  return (
    <main>
      <ProSettingsDetailHeader
        title="Privacidade na Comunidade"
        subtitle="O que outros profissionais veem no seu perfil público dentro da Comunidade — não afeta seu Perfil profissional geral na Doopla."
      />

      <ProCard>
        <CommunityPrivacyForm
          availableForReferrals={communityProfile?.availableForReferrals ?? false}
          showCity={communityProfile?.showCity ?? false}
          showAvatar={communityProfile?.showAvatar ?? false}
          showBio={communityProfile?.showBio ?? false}
          showSpecialties={communityProfile?.showSpecialties ?? false}
          showWorkTypes={communityProfile?.showWorkTypes ?? false}
          showInstagram={communityProfile?.showInstagram ?? false}
          showPortfolio={communityProfile?.showPortfolio ?? false}
        />
      </ProCard>
    </main>
  );
}
