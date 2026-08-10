import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import type {
  AgencyProfile,
  ArtistProfile,
  BookerProfile,
  Invite,
  Profile,
} from '@/lib/supabase/types';
import { confirmInviteAction } from './actions';

export const metadata: Metadata = {
  title: 'Painel | Doopla',
};

const ROLE_LABELS: Record<Profile['role'], string> = {
  artista: 'Artista',
  booker: 'Booker',
  agencia: 'Agência',
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // O proxy.ts já protege esta rota; a checagem aqui é uma segunda camada
  // caso a página seja alcançada por outro caminho.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile) {
    redirect('/login?next=/dashboard');
  }

  const roleDetails = await getRoleDetails(profile.role, user.id, supabase);
  const pendingInvites =
    profile.role === 'artista'
      ? await getPendingInvites(user.id, supabase)
      : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/60 dark:text-white/60">
            {ROLE_LABELS[profile.role]}
          </p>
          <h1 className="text-2xl font-semibold">
            Olá, {profile.full_name || user.email}
          </h1>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium dark:border-white/20"
          >
            Sair
          </button>
        </form>
      </header>

      {pendingInvites.length > 0 && (
        <section className="rounded-lg border border-[var(--accent-ink)]/30 bg-[var(--paper-dim)] p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--accent-ink)]">
            Convites pendentes
          </h2>
          <ul className="flex flex-col gap-3">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  <strong>{invite.inviterName}</strong> convidou você para
                  trabalhar com ele na doopla.
                </span>
                <form action={confirmInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
                  >
                    Confirmar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Conta
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-black/60 dark:text-white/60">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-black/60 dark:text-white/60">Tipo de conta</dt>
          <dd>{ROLE_LABELS[profile.role]}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Perfil de {ROLE_LABELS[profile.role].toLowerCase()}
        </h2>
        <RoleDetails role={profile.role} details={roleDetails} />
      </section>
    </main>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getPendingInvites(userId: string, supabase: SupabaseServerClient) {
  const { data: invites } = await supabase
    .from('invites')
    .select('*')
    .eq('invitee_profile_id', userId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .returns<Invite[]>();

  if (!invites || invites.length === 0) return [];

  const inviterIds = [...new Set(invites.map((i) => i.inviter_profile_id))];
  const { data: inviters } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', inviterIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  const nameById = new Map((inviters ?? []).map((p) => [p.id, p.full_name]));
  return invites.map((invite) => ({
    ...invite,
    inviterName: nameById.get(invite.inviter_profile_id) ?? 'Alguém',
  }));
}

async function getRoleDetails(
  role: Profile['role'],
  userId: string,
  supabase: SupabaseServerClient
) {
  if (role === 'artista') {
    const { data } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('profile_id', userId)
      .single<ArtistProfile>();
    return data;
  }
  if (role === 'booker') {
    const { data } = await supabase
      .from('booker_profiles')
      .select('*')
      .eq('profile_id', userId)
      .single<BookerProfile>();
    return data;
  }
  const { data } = await supabase
    .from('agency_profiles')
    .select('*')
    .eq('profile_id', userId)
    .single<AgencyProfile>();
  return data;
}

function RoleDetails({
  role,
  details,
}: {
  role: Profile['role'];
  details: ArtistProfile | BookerProfile | AgencyProfile | null;
}) {
  if (!details) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Nenhum dado adicional preenchido ainda.
      </p>
    );
  }

  if (role === 'artista') {
    const artist = details as ArtistProfile;
    const isPontual = artist.intencao === 'Ajuda pontual num caso específico';
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-black/60 dark:text-white/60">O que busca</dt>
        <dd>{artist.intencao || '—'}</dd>
        {isPontual ? (
          <>
            <dt className="text-black/60 dark:text-white/60">Ajuda pedida</dt>
            <dd>{artist.pontual_detalhe || '—'}</dd>
          </>
        ) : (
          <>
            <dt className="text-black/60 dark:text-white/60">O que faz</dt>
            <dd>{artist.funcao || '—'}</dd>
            <dt className="text-black/60 dark:text-white/60">Onde atua</dt>
            <dd>{artist.local || '—'}</dd>
            <dt className="text-black/60 dark:text-white/60">Mercados</dt>
            <dd>{artist.mercados || '—'}</dd>
            <dt className="text-black/60 dark:text-white/60">Já tem booker</dt>
            <dd>{artist.tem_booker || '—'}</dd>
          </>
        )}
      </dl>
    );
  }

  if (role === 'booker') {
    const booker = details as BookerProfile;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-black/60 dark:text-white/60">Perfil</dt>
        <dd>{booker.perfil || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Foco</dt>
        <dd>{booker.foco || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Mercados</dt>
        <dd>{booker.mercados || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Quem quer representar</dt>
        <dd>{booker.quem || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Cidades da rede</dt>
        <dd>{booker.cidades || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Já representa alguém</dt>
        <dd>{booker.ja_representa || '—'}</dd>
        {booker.roster && (
          <>
            <dt className="text-black/60 dark:text-white/60">Nº de artistas (agência)</dt>
            <dd>{booker.roster}</dd>
          </>
        )}
      </dl>
    );
  }

  const agency = details as AgencyProfile;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-black/60 dark:text-white/60">Agência</dt>
      <dd>{agency.agency_name}</dd>
      <dt className="text-black/60 dark:text-white/60">Nº de artistas</dt>
      <dd>{agency.roster || '—'}</dd>
      <dt className="text-black/60 dark:text-white/60">Nº de agentes</dt>
      <dd>{agency.agentes || '—'}</dd>
      <dt className="text-black/60 dark:text-white/60">Principal mercado</dt>
      <dd>{agency.mercado || '—'}</dd>
    </dl>
  );
}
