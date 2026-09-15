import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionProfile } from '../../session';
import { ProProfileWorkForm } from '../pro-profile-work-form';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Perfil e trabalho | Doopla',
};

type ArtistProfileData = {
  stage_name: string | null;
  category: string | null;
  bio: string | null;
  what_you_do: string | null;
  where_you_serve: string | null;
  base_fee_cents: number | null;
  pricing_notes: string | null;
  issues_invoice: boolean | null;
};

// Redesign "Perfil e trabalho" (15/09/2026) — unifica "Dados
// profissionais" e "Como você trabalha" (2 rotas separadas desde o
// Settings V2 de 09/09/2026) numa página só, 3 grupos (Informações
// profissionais / Seu trabalho / Valores e condições), pra acabar com
// a duplicidade de navegação pra informações que fazem parte do mesmo
// contexto. `/dashboard/perfil/trabalho` continua existindo como
// redirect pra cá (links antigos, ex. Preferências da Doopla, nunca
// quebram). Rota em si (`/dados`) preservada — só o conteúdo mudou.
//
// Polimento visual (15/09/2026, 2ª rodada) — os 3 grupos e o avatar
// agora vivem dentro de 1 único ProProfileWorkForm/ProCard (1 form, 1
// botão "Salvar alterações"), não mais 3 ProCards separados com título
// técnico cada um — ver comentário em pro-profile-work-form.tsx.
export default async function PerfilTrabalhoPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('stage_name, category, bio, what_you_do, where_you_serve, base_fee_cents, pricing_notes, issues_invoice')
    .eq('profile_id', user.id)
    .single<ArtistProfileData>();

  return (
    <main>
      <ProSettingsDetailHeader
        title="Perfil e trabalho"
        subtitle="Quem você é, o que faz e como cobra: o que ajuda sua Doopla a te representar melhor."
      />

      <ProProfileWorkForm
        avatarUrl={profile.avatar_url}
        fallbackName={profile.full_name}
        stageName={artist?.stage_name ?? null}
        category={artist?.category ?? null}
        bio={artist?.bio ?? null}
        whatYouDo={artist?.what_you_do ?? null}
        whereYouServe={artist?.where_you_serve ?? null}
        baseFeeCents={artist?.base_fee_cents ?? null}
        pricingNotes={artist?.pricing_notes ?? null}
        issuesInvoice={artist?.issues_invoice ?? null}
      />
    </main>
  );
}
