import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ensureCommunityProfileActivated, getMyCommunityProfile } from '@/lib/community/data';

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

  // Mesma convenção de "ativação invisível" já usada em toda superfície
  // de Comunidade — nenhum passo explícito de "entrar" antes de ver as
  // próprias preferências (ver comentário de ensureCommunityProfileActivated
  // em src/lib/community/data.ts). Visitar esta tela é, em si, uma ação
  // relacionada à Comunidade — consistente com o resto do produto, não
  // uma decisão nova.
  await ensureCommunityProfileActivated(supabase);
  const communityProfile = await getMyCommunityProfile(supabase);

  // Só acontece se a ativação acima falhar silenciosamente por algum
  // motivo interno — nunca o fluxo esperado, mas evita renderizar o
  // form sem dado nenhum pra sustentar os defaultChecked.
  if (!communityProfile) redirect('/dashboard/perfil/privacidade');

  return (
    <main>
      <ProSettingsDetailHeader
        title="Privacidade na Comunidade"
        subtitle="O que outros profissionais veem no seu perfil público dentro da Comunidade — não afeta seu Perfil profissional geral na Doopla."
      />

      <ProCard>
        <CommunityPrivacyForm
          availableForReferrals={communityProfile.availableForReferrals}
          showCity={communityProfile.showCity}
          showAvatar={communityProfile.showAvatar}
          showBio={communityProfile.showBio}
          showSpecialties={communityProfile.showSpecialties}
          showWorkTypes={communityProfile.showWorkTypes}
          showInstagram={communityProfile.showInstagram}
          showPortfolio={communityProfile.showPortfolio}
        />
      </ProCard>
    </main>
  );
}
