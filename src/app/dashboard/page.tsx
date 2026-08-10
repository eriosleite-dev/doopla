import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import type {
  AgencyProfile,
  ArtistProfile,
  BookerProfile,
  Profile,
} from '@/lib/supabase/types';

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
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-black/60 dark:text-white/60">Nome artístico</dt>
        <dd>{artist.stage_name || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Gêneros</dt>
        <dd>{artist.genres.length ? artist.genres.join(', ') : '—'}</dd>
      </dl>
    );
  }

  if (role === 'booker') {
    const booker = details as BookerProfile;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-black/60 dark:text-white/60">Empresa/local</dt>
        <dd>{booker.venue_name || booker.company_name || '—'}</dd>
        <dt className="text-black/60 dark:text-white/60">Cargo</dt>
        <dd>{booker.position || '—'}</dd>
      </dl>
    );
  }

  const agency = details as AgencyProfile;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-black/60 dark:text-white/60">Agência</dt>
      <dd>{agency.agency_name}</dd>
      <dt className="text-black/60 dark:text-white/60">Site</dt>
      <dd>{agency.website || '—'}</dd>
    </dl>
  );
}
