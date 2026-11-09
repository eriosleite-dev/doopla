import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { siteOrigin } from '@/lib/site-url';

import { getSessionProfile } from '../../session';
import { PublicProfileCard } from '../public-profile-card';
import { ProSettingsDetailHeader } from '../settings-ui';

export const metadata: Metadata = {
  title: 'Perfil público | Doopla',
};

type PublicArtistFields = {
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
};

// Settings V2 consolidado (09/09/2026) — "Perfil público", uma das 3
// rotas que substituem o antigo /dashboard/perfil/editar. Conceito
// distinto de "Dados profissionais"/"Como você trabalha": aqui é
// especificamente o que o CLIENTE vê (confirmado em
// src/app/[slug]/page.tsx — nome, categoria, bio, mercados, instagram,
// portfólio; nunca website_url/other_links, que ficam em "Dados
// profissionais"). Mesmo componente/actions de sempre, só rota própria.
export default async function PerfilPublicoPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const [{ data: artist }, origin] = await Promise.all([
    supabase
      .from('artist_profiles')
      .select('public_enabled, instagram_url, portfolio_url')
      .eq('profile_id', user.id)
      .single<PublicArtistFields>(),
    siteOrigin(),
  ]);

  return (
    <main>
      <ProSettingsDetailHeader
        title="Perfil público"
        subtitle="O que aparece pra clientes quando alguém vê seu link."
      />
      <PublicProfileCard
        slug={profile.slug}
        publicEnabled={artist?.public_enabled ?? false}
        instagramUrl={artist?.instagram_url ?? null}
        portfolioUrl={artist?.portfolio_url ?? null}
        siteUrl={origin}
      />
    </main>
  );
}
