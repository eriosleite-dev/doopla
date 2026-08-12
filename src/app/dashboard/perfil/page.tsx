import type { Metadata } from 'next';

import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';

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

      <section className={cardClass}>
        <p className={eyebrowClass}>Perfil de {ROLE_LABELS[profile.role].toLowerCase()}</p>
        <div className="mt-4">
          <RoleDetails role={profile.role} details={details} />
        </div>
      </section>
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
};

type BookerDetails = {
  perfil: string | null;
  foco: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
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
      .select('intencao, pontual_detalhe, funcao, local, mercados, tem_booker')
      .eq('profile_id', userId)
      .single<ArtistDetails>();
    return data;
  }
  if (role === 'booker') {
    const { data } = await supabase
      .from('booker_profiles')
      .select('perfil, foco, mercados, quem, cidades, ja_representa, roster')
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
    const isPontual = artist.intencao === 'Ajuda pontual num caso específico';
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--ink)]/55">O que busca</dt>
        <dd>{artist.intencao || '—'}</dd>
        {isPontual ? (
          <>
            <dt className="text-[var(--ink)]/55">Ajuda pedida</dt>
            <dd>{artist.pontual_detalhe || '—'}</dd>
          </>
        ) : (
          <>
            <dt className="text-[var(--ink)]/55">O que faz</dt>
            <dd>{artist.funcao || '—'}</dd>
            <dt className="text-[var(--ink)]/55">Onde atua</dt>
            <dd>{artist.local || '—'}</dd>
            <dt className="text-[var(--ink)]/55">Mercados</dt>
            <dd>{artist.mercados || '—'}</dd>
            <dt className="text-[var(--ink)]/55">Já tem booker</dt>
            <dd>{artist.tem_booker || '—'}</dd>
          </>
        )}
      </dl>
    );
  }

  if (role === 'booker') {
    const booker = details as BookerDetails;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--ink)]/55">Perfil</dt>
        <dd>{booker.perfil || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Foco</dt>
        <dd>{booker.foco || '—'}</dd>
        <dt className="text-[var(--ink)]/55">Mercados</dt>
        <dd>{booker.mercados || '—'}</dd>
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
