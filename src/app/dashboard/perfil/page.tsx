import type { Metadata } from 'next';
import Link from 'next/link';

import { siteOrigin } from '@/lib/site-url';
import type { LinkRoutingMode } from '@/lib/supabase/types';

import { getArtistBookers, getArtistLinkRouting } from '../data';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { ArtistProfileForm } from './artist-profile-form';
import { AvatarUploader } from './avatar-uploader';
import { BookerProfileForm } from './booker-profile-form';
import { LinkRoutingCard } from './link-routing-card';
import { PublicProfileCard } from './public-profile-card';

export const metadata: Metadata = {
  title: 'Perfil | Doopla',
};

const ROLE_LABELS: Record<'artista' | 'booker' | 'agencia', string> = {
  artista: 'Artista',
  booker: 'Booker',
  agencia: 'Agência',
};

export default async function PerfilPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const details = await getRoleDetails(profile.role, user.id, supabase);
  const origin = await siteOrigin();

  const artistDetails = profile.role === 'artista' ? (details as ArtistDetails | null) : null;
  const bookerDetails = profile.role === 'booker' ? (details as BookerDetails | null) : null;

  const [bookers, routing] =
    profile.role === 'artista'
      ? await Promise.all([
          getArtistBookers(user.id, supabase),
          getArtistLinkRouting(user.id, supabase),
        ])
      : [[], null];

  return (
    <main className="flex max-w-xl flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Perfil</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          {profile.full_name || user.email}
        </h1>
      </header>

      <section className={cardClass}>
        <p className={eyebrowClass}>Conta</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--ink)]/55">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-[var(--ink)]/55">Tipo de conta</dt>
          <dd>{ROLE_LABELS[profile.role]}</dd>
        </dl>
      </section>

      <div className="flex flex-col gap-4">
        <div>
          <p className={eyebrowClass}>Perfil público</p>
          <p className="mt-1 text-sm text-[var(--ink)]/55">
            O que aparece pra clientes e bookers quando alguém vê seu link ou perfil.
          </p>
        </div>

        <section className={cardClass}>
          <p className={eyebrowClass}>Foto</p>
          <div className="mt-4">
            <AvatarUploader currentUrl={profile.avatar_url} fallbackName={profile.full_name} />
          </div>
        </section>

        <section className={cardClass}>
          {profile.role === 'artista' ? (
            <ArtistProfileForm
              stageName={artistDetails?.stage_name ?? null}
              category={artistDetails?.category ?? null}
              subcategory={artistDetails?.subcategory ?? null}
              bio={artistDetails?.bio ?? null}
              genres={artistDetails?.genres ?? []}
              mercados={artistDetails?.mercados ?? null}
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
            />
          ) : profile.role === 'booker' ? (
            <BookerProfileForm
              professionalName={bookerDetails?.professional_name ?? null}
              bio={bookerDetails?.bio ?? null}
              mercados={bookerDetails?.mercados ?? null}
              experience={bookerDetails?.experience ?? null}
              instagramUrl={bookerDetails?.instagram_url ?? null}
              websiteUrl={bookerDetails?.website_url ?? null}
              capacity={bookerDetails?.capacity ?? null}
              feeRange={bookerDetails?.fee_range ?? []}
              commissionRange={bookerDetails?.commission_range ?? null}
              artistCategories={bookerDetails?.artist_categories ?? []}
              clientTypes={bookerDetails?.client_types ?? []}
              regions={bookerDetails?.regions ?? []}
              languages={bookerDetails?.languages ?? []}
              specialtyAreas={bookerDetails?.specialty_areas ?? []}
            />
          ) : (
            <RoleDetails role={profile.role} details={details} />
          )}
        </section>

        {profile.role === 'artista' && (
          <PublicProfileCard
            slug={profile.slug}
            publicEnabled={artistDetails?.public_enabled ?? false}
            instagramUrl={artistDetails?.instagram_url ?? null}
            portfolioUrl={artistDetails?.portfolio_url ?? null}
            siteUrl={origin}
          />
        )}
      </div>

      {profile.role === 'artista' && (
        <LinkRoutingCard
          bookers={bookers.map((b) => ({ profileId: b.profileId, fullName: b.fullName }))}
          currentMode={(routing?.mode ?? 'eu') as LinkRoutingMode}
          currentBookerId={routing?.booker_id ?? null}
          orcamentoUrl={profile.slug ? `${origin}/orcamento/${profile.slug}` : null}
        />
      )}

      {profile.role === 'booker' && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Sua rede</p>
          <p className="mt-4 text-sm text-[var(--ink)]/60">
            Já trabalha com algum artista que ainda não está na doopla?{' '}
            <Link
              href="/dashboard/artistas#convites"
              className="text-[var(--accent-ink)] underline underline-offset-2"
            >
              Convide agora
            </Link>{' '}
            — pode fazer isso a qualquer momento, aqui ou em Meus Artistas.
          </p>
        </section>
      )}

      {(profile.role === 'artista' || profile.role === 'booker') && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Respostas do cadastro</p>
          <div className="mt-4">
            <RoleDetails role={profile.role} details={details} />
          </div>
        </section>
      )}
    </main>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof getSessionProfile>>['supabase'];

type ArtistDetails = {
  intencao: string | null;
  pontual_detalhe: string | null;
  funcao: string | null;
  local: string | null;
  mercados: string | null;
  tem_booker: string | null;
  stage_name: string | null;
  category: string | null;
  bio: string | null;
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
  subcategory: string | null;
  genres: string[];
  website_url: string | null;
  other_links: string | null;
  other_preferences: string | null;
  travels: boolean;
  serves_other_locations: boolean;
  accepts_out_of_city_work: boolean;
  work_types: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  career_stage: string | null;
  help_areas: string[];
  fee_range: string | null;
};

type BookerDetails = {
  modo_trabalho: string | null;
  perfil: string | null;
  foco: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
  professional_name: string | null;
  bio: string | null;
  experience: string | null;
  instagram_url: string | null;
  artist_categories: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  specialty_areas: string[];
  capacity: string | null;
  fee_range: string[];
  commission_range: string | null;
  website_url: string | null;
};

type AgencyDetails = {
  agency_name: string;
  roster: string | null;
  agentes: string | null;
  mercado: string | null;
};

async function getRoleDetails(
  role: 'artista' | 'booker' | 'agencia',
  userId: string,
  supabase: SupabaseServerClient
) {
  if (role === 'artista') {
    const { data } = await supabase
      .from('artist_profiles')
      .select(
        'intencao, pontual_detalhe, funcao, local, mercados, tem_booker, stage_name, category, bio, public_enabled, instagram_url, portfolio_url, subcategory, genres, website_url, other_links, other_preferences, travels, serves_other_locations, accepts_out_of_city_work, work_types, client_types, regions, languages, career_stage, help_areas, fee_range'
      )
      .eq('profile_id', userId)
      .single<ArtistDetails>();
    return data;
  }
  if (role === 'booker') {
    const { data } = await supabase
      .from('booker_profiles')
      .select(
        'modo_trabalho, perfil, foco, mercados, quem, cidades, ja_representa, roster, professional_name, bio, experience, instagram_url, artist_categories, client_types, regions, languages, specialty_areas, capacity, fee_range, commission_range, website_url'
      )
      .eq('profile_id', userId)
      .single<BookerDetails>();
    return data;
  }
  const { data } = await supabase
    .from('agency_profiles')
    .select('agency_name, roster, agentes, mercado')
    .eq('profile_id', userId)
    .single<AgencyDetails>();
  return data;
}

function RoleDetails({
  role,
  details,
}: {
  role: 'artista' | 'booker' | 'agencia';
  details: ArtistDetails | BookerDetails | AgencyDetails | null;
}) {
  if (!details) {
    return <p className="text-sm text-[var(--ink)]/55">Nenhum dado adicional preenchido ainda.</p>;
  }

  if (role === 'artista') {
    const artist = details as ArtistDetails;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--ink)]/55">O que busca</dt>
        <dd>{artist.intencao || '—'}</dd>
        {artist.pontual_detalhe && (
          <>
            <dt className="text-[var(--ink)]/55">Ajuda pontual pedida</dt>
            <dd>{artist.pontual_detalhe}</dd>
          </>
        )}
        <dt className="text-[var(--ink)]/55">Onde atua</dt>
        <dd>{artist.local || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Já tem booker</dt>
        <dd>{artist.tem_booker || '—'}</dd>
      </dl>
    );
  }

  if (role === 'booker') {
    const booker = details as BookerDetails;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--ink)]/55">Como quer trabalhar</dt>
        <dd>{booker.modo_trabalho || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Perfil</dt>
        <dd>{booker.perfil || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Foco</dt>
        <dd>{booker.foco || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Quem quer representar</dt>
        <dd>{booker.quem || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Cidades da rede</dt>
        <dd>{booker.cidades || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Já representa alguém</dt>
        <dd>{booker.ja_representa || '—'}</dd>
        {booker.roster && (
          <>
            <dt className="text-[var(--ink)]/55">Nº de artistas (agência)</dt>
            <dd>{booker.roster}</dd>
          </>
        )}
      </dl>
    );
  }

  const agency = details as AgencyDetails;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-[var(--ink)]/55">Agência</dt>
      <dd>{agency.agency_name}</dd>
      <dt className="text-[var(--ink)]/55">Nº de artistas</dt>
      <dd>{agency.roster || '—'}</dd>
      <dt className="text-[var(--ink)]/55">Nº de agentes</dt>
      <dd>{agency.agentes || '—'}</dd>
      <dt className="text-[var(--ink)]/55">Principal mercado</dt>
      <dd>{agency.mercado || '—'}</dd>
    </dl>
  );
}
