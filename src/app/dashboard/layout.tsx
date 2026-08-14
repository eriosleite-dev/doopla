import Link from 'next/link';

import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

import { getSessionProfile } from './session';

type NavBadges = {
  opportunitiesCount: number;
  negotiationCount: number;
  negotiationHref: string | null;
};

async function getNavBadges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: Profile['role']
): Promise<NavBadges> {
  if (role === 'booker') {
    const { data: bookerProfile } = await supabase
      .from('booker_profiles')
      .select('opportunities_seen_at')
      .eq('profile_id', userId)
      .single<{ opportunities_seen_at: string }>();

    const { data: dismissals } = await supabase
      .from('opportunity_dismissals')
      .select('opportunity_id')
      .eq('booker_profile_id', userId)
      .returns<{ opportunity_id: string }[]>();
    const dismissedIds = (dismissals ?? []).map((d) => d.opportunity_id);

    let query = supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aberta')
      .gt('created_at', bookerProfile?.opportunities_seen_at ?? '1970-01-01');
    if (dismissedIds.length > 0) {
      query = query.not('id', 'in', `(${dismissedIds.join(',')})`);
    }
    const { count } = await query;
    return { opportunitiesCount: count ?? 0, negotiationCount: 0, negotiationHref: null };
  }

  const { data: pending } = await supabase
    .from('bookings')
    .select('id, created_at')
    .eq('artist_profile_id', userId)
    .eq('status', 'proposta_enviada')
    .neq('proposed_by', 'artista')
    .order('created_at', { ascending: true })
    .returns<{ id: string; created_at: string }[]>();

  return {
    opportunitiesCount: 0,
    negotiationCount: pending?.length ?? 0,
    negotiationHref: pending && pending.length > 0 ? `/dashboard/bookings/${pending[0].id}` : null,
  };
}

export default async function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  const { supabase, user, profile } = await getSessionProfile();

  const badges = await getNavBadges(supabase, user.id, profile.role);

  return (
    <div className="min-h-screen bg-[var(--paper)] font-doopla-sans text-[var(--ink)]">
      <div className="flex items-center justify-between border-b border-[var(--line-light)] px-6 py-4 sm:px-10">
        <Link href="/dashboard" className="font-doopla-display text-xl font-semibold">
          doopla
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/dashboard"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            Seu painel
          </Link>
          <Link
            href="/dashboard/trabalhos"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            Trabalhos
          </Link>
          <Link
            href="/dashboard/agenda"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            Agenda
          </Link>
          <Link
            href="/dashboard/contratos"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            Contratos
          </Link>
          <Link
            href="/dashboard/dinheiro"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            {profile.role === 'booker' ? 'Meus ganhos' : 'Dinheiro'}
          </Link>
          {profile.role === 'booker' ? (
            <>
              <Link
                href="/dashboard/oportunidades"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Oportunidades
                {badges.opportunitiesCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--ink)]">
                    {badges.opportunitiesCount}
                  </span>
                )}
              </Link>
              <Link
                href="/dashboard/propor"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Nova proposta
              </Link>
              <Link
                href="/dashboard/artistas"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Artistas
              </Link>
            </>
          ) : (
            <>
              <Link
                href={badges.negotiationHref ?? '/dashboard'}
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Negociação
                {badges.negotiationCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--ink)]">
                    {badges.negotiationCount}
                  </span>
                )}
              </Link>
              <Link
                href="/dashboard/publicar-trabalho"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Publicar trabalho
              </Link>
              <Link
                href="/dashboard/oportunidades"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Oportunidades
              </Link>
              <Link
                href="/dashboard/bookers"
                className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
              >
                Bookers
              </Link>
            </>
          )}
          <Link
            href="/dashboard/perfil"
            className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
          >
            Perfil
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="font-doopla-mono ml-2 rounded-full border border-[var(--ink)]/20 px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:border-[var(--ink)] hover:text-[var(--ink)]"
            >
              Sair
            </button>
          </form>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10">{children}</div>
    </div>
  );
}
