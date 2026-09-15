import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProAvatarUploader } from '../pro-avatar-uploader';
import { ProArtistIdentityForm } from '../pro-artist-identity-form';
import { ProWorkContextForm } from '../pro-work-context-form';
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

      <div className="flex flex-col gap-3.5">
        <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--pro-tx-30)]">
          Informações profissionais
        </p>
        <ProCard>
          <p className="font-pro-sub text-[13.5px] font-bold">Foto</p>
          <div className="mt-4">
            <ProAvatarUploader currentUrl={profile.avatar_url} fallbackName={profile.full_name} />
          </div>
        </ProCard>
        <ProCard>
          <ProArtistIdentityForm
            stageName={artist?.stage_name ?? null}
            category={artist?.category ?? null}
            bio={artist?.bio ?? null}
          />
        </ProCard>

        <ProWorkContextForm
          whatYouDo={artist?.what_you_do ?? null}
          whereYouServe={artist?.where_you_serve ?? null}
          baseFeeCents={artist?.base_fee_cents ?? null}
          pricingNotes={artist?.pricing_notes ?? null}
          issuesInvoice={artist?.issues_invoice ?? null}
        />
      </div>
    </main>
  );
}
