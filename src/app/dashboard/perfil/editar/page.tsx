import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { siteOrigin } from '@/lib/site-url';

import { getArtistBookers, getArtistLinkRouting } from '../../data';
import { getSessionProfile } from '../../session';
import { cardClass, eyebrowClass } from '../../ui';
import { ArtistProfileForm } from '../artist-profile-form';
import { AvatarUploader } from '../avatar-uploader';
import { LinkRoutingCard } from '../link-routing-card';
import { PublicProfileCard } from '../public-profile-card';
import type { LinkRoutingMode } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Editar perfil | Doopla',
};

type ArtistDetails = {
  stage_name: string | null;
  category: string | null;
  subcategory: string | null;
  bio: string | null;
  genres: string[];
  mercados: string | null;
  local: string | null;
  website_url: string | null;
  other_links: string | null;
  other_preferences: string | null;
  travels: boolean;
  serves_other_locations: boolean;
  accepts_out_of_city_work: boolean;
  career_stage: string | null;
  fee_range: string | null;
  work_types: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  help_areas: string[];
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
  issues_invoice: boolean | null;
};

// Item 13 da revisão Professional Web Dashboard (06/09/2026) — "Perfil"
// (informações profissionais que representam a pessoa) separado
// conceitualmente de "Configurações" (plano/conta/WhatsApp/segurança).
// Mesmos componentes reais de sempre (ArtistProfileForm/AvatarUploader/
// PublicProfileCard/LinkRoutingCard), só relocados pra uma rota própria
// — nenhuma lógica/campo novo, nenhum re-skin visual (fora de escopo
// desta rodada, registrado no relatório final).
export default async function EditarPerfilPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard/perfil');

  const { data: artistDetails } = await supabase
    .from('artist_profiles')
    .select(
      'stage_name, category, subcategory, bio, genres, mercados, local, website_url, other_links, other_preferences, travels, serves_other_locations, accepts_out_of_city_work, career_stage, fee_range, work_types, client_types, regions, languages, help_areas, public_enabled, instagram_url, portfolio_url, issues_invoice'
    )
    .eq('profile_id', user.id)
    .single<ArtistDetails>();

  const [bookers, routing, origin] = await Promise.all([
    getArtistBookers(user.id, supabase),
    getArtistLinkRouting(user.id, supabase),
    siteOrigin(),
  ]);

  return (
    <main className="flex max-w-xl flex-col gap-8">
      <Link
        href="/dashboard/perfil/preferencias"
        className="text-[12.5px] font-medium text-[var(--ink)]/50 underline underline-offset-2 hover:text-[var(--ink)]"
      >
        ← Preferências da Doopla
      </Link>
      <header>
        <p className={eyebrowClass}>Perfil profissional</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">{profile.full_name || user.email}</h1>
        <p className="mt-1.5 text-sm text-[var(--ink)]/55">O que aparece pra clientes e bookers quando alguém vê seu link ou perfil.</p>
      </header>

      <section className={cardClass}>
        <p className={eyebrowClass}>Foto</p>
        <div className="mt-4">
          <AvatarUploader currentUrl={profile.avatar_url} fallbackName={profile.full_name} />
        </div>
      </section>

      <section className={cardClass}>
        <ArtistProfileForm
          stageName={artistDetails?.stage_name ?? null}
          category={artistDetails?.category ?? null}
          subcategory={artistDetails?.subcategory ?? null}
          bio={artistDetails?.bio ?? null}
          genres={artistDetails?.genres ?? []}
          mercados={artistDetails?.mercados ?? null}
          local={artistDetails?.local ?? null}
          websiteUrl={artistDetails?.website_url ?? null}
          otherLinks={artistDetails?.other_links ?? null}
          otherPreferences={artistDetails?.other_preferences ?? null}
          travels={artistDetails?.travels ?? false}
          servesOtherLocations={artistDetails?.serves_other_locations ?? false}
          acceptsOutOfCityWork={artistDetails?.accepts_out_of_city_work ?? false}
          careerStage={artistDetails?.career_stage ?? null}
          feeRange={artistDetails?.fee_range ?? null}
          workTypes={artistDetails?.work_types ?? []}
          clientTypes={artistDetails?.client_types ?? []}
          regions={artistDetails?.regions ?? []}
          languages={artistDetails?.languages ?? []}
          helpAreas={artistDetails?.help_areas ?? []}
          issuesInvoice={artistDetails?.issues_invoice ?? null}
        />
      </section>

      <PublicProfileCard
        slug={profile.slug}
        publicEnabled={artistDetails?.public_enabled ?? false}
        instagramUrl={artistDetails?.instagram_url ?? null}
        portfolioUrl={artistDetails?.portfolio_url ?? null}
        siteUrl={origin}
      />

      <LinkRoutingCard
        bookers={bookers.map((b) => ({ profileId: b.profileId, fullName: b.fullName }))}
        currentMode={(routing?.mode ?? 'eu') as LinkRoutingMode}
        currentBookerId={routing?.booker_id ?? null}
        orcamentoUrl={profile.slug ? `${origin}/orcamento/${profile.slug}` : null}
      />
    </main>
  );
}
