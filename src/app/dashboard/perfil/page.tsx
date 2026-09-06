import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanCard } from '../booker-pro/plan-card';
import { getSubscription } from '../data';
import { getCachedProfessionalHomeFacts } from '../pro-home-cache';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { AvatarUploader } from './avatar-uploader';
import { BookerProfileForm } from './booker-profile-form';
import { ProConfiguracoesView } from './pro-configuracoes-view';

export const metadata: Metadata = {
  title: 'Configurações | Doopla',
};

const ROLE_LABELS: Record<'artista' | 'booker' | 'agencia', string> = {
  artista: 'Artista',
  booker: 'Booker',
  agencia: 'Agência',
};

// Rota compartilhada — item 12/13 da revisão Professional Web Dashboard
// (06/09/2026): profissional/artista vê a nova tela de Configurações
// (ProConfiguracoesView); Booker/Agência continuam vendo exatamente o
// Perfil legado de sempre (fora de escopo desta revisão, shell legado
// intocado — mesmo padrão de Bookings/Agenda/Financeiro).
export default async function PerfilPage() {
  const { supabase, user, profile } = await getSessionProfile();

  if (profile.role === 'artista') {
    const [subscription, homeFacts] = await Promise.all([
      getSubscription(user.id, supabase),
      getCachedProfessionalHomeFacts(supabase),
    ]);
    return (
      <ProConfiguracoesView
        fullName={profile.full_name}
        email={user.email ?? ''}
        phone={profile.phone}
        subscription={subscription}
        whatsappStatus={homeFacts?.whatsappIdentityStatus ?? null}
        whatsappNumber={homeFacts?.whatsappVerifiedNumber ?? null}
      />
    );
  }

  const details = await getRoleDetails(profile.role, user.id, supabase);

  const bookerDetails = profile.role === 'booker' ? (details as BookerDetails | null) : null;

  const subscription = profile.role === 'booker' ? await getSubscription(user.id, supabase) : null;

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

      {subscription && (
        <PlanCard
          plan={subscription.booker_plan}
          periodEndsAt={subscription.pro_period_ends_at}
          canceled={Boolean(subscription.canceled_at)}
        />
      )}

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
          {profile.role === 'booker' ? (
            <BookerProfileForm
              professionalName={bookerDetails?.professional_name ?? null}
              bio={bookerDetails?.bio ?? null}
              mercados={bookerDetails?.mercados ?? null}
              cidades={bookerDetails?.cidades ?? null}
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
      </div>

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

      <section className={cardClass}>
        <p className={eyebrowClass}>Respostas do cadastro</p>
        <div className="mt-4">
          <RoleDetails role={profile.role} details={details} />
        </div>
      </section>
    </main>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof getSessionProfile>>['supabase'];

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
  role: 'booker' | 'agencia';
  details: BookerDetails | AgencyDetails | null;
}) {
  if (!details) {
    return <p className="text-sm text-[var(--ink)]/55">Nenhum dado adicional preenchido ainda.</p>;
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
