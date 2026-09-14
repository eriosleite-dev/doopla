import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProCard } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProAvatarUploader } from '../pro-avatar-uploader';
import { ProArtistIdentityForm } from '../pro-artist-identity-form';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Dados profissionais | Doopla',
};

type ArtistIdentity = {
  stage_name: string | null;
  category: string | null;
  bio: string | null;
  genres: string[];
  website_url: string | null;
  other_links: string | null;
};

// Settings V2 consolidado (09/09/2026) — "Dados profissionais", uma das
// 3 rotas que substituem o antigo /dashboard/perfil/editar (página
// única). Identidade/apresentação do profissional: foto, nome
// artístico, categoria, bio, gêneros, site, outros links.
// `website_url`/`other_links` confirmados (src/app/[slug]/page.tsx) como
// NÃO exibidos na página pública — ficam aqui, não em "Perfil público".
// Subcategoria/Mercados saíram da UI do beta (14/09/2026, sem
// consumidor confirmado) — colunas preservadas, só não selecionadas
// aqui.
export default async function DadosProfissionaisPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('stage_name, category, bio, genres, website_url, other_links')
    .eq('profile_id', user.id)
    .single<ArtistIdentity>();

  return (
    <main>
      <ProSettingsDetailHeader
        title="Dados profissionais"
        subtitle="Nome artístico, categoria e as informações que te descrevem como profissional."
      />

      <div className="flex flex-col gap-3.5">
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
            genres={artist?.genres ?? []}
            websiteUrl={artist?.website_url ?? null}
            otherLinks={artist?.other_links ?? null}
          />
        </ProCard>
      </div>
    </main>
  );
}
