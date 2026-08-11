import Link from 'next/link';

import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

import { getSessionProfile } from './session';

// Badge de "trabalhos novos não vistos" — só existe pro booker (o artista
// não tem mural pra navegar, só recebe propostas).
async function getUnseenOpportunitiesCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
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
  return count ?? 0;
}

type NavItem = { label: string; href: string; badge?: number };

function navItemsFor(role: Profile['role'], opportunitiesCount: number): NavItem[] {
  if (role === 'booker') {
    return [
      { label: 'Hoje', href: '/dashboard' },
      { label: 'Trabalhos', href: '/dashboard/trabalhos', badge: opportunitiesCount },
      { label: 'Artistas', href: '/dashboard/artistas' },
      { label: 'Contratos', href: '/dashboard/contratos' },
      { label: 'Meus ganhos', href: '/dashboard/ganhos' },
      { label: 'Perfil', href: '/dashboard/perfil' },
    ];
  }
  return [
    { label: 'Hoje', href: '/dashboard' },
    { label: 'Trabalhos', href: '/dashboard/trabalhos' },
    { label: 'Contratos', href: '/dashboard/contratos' },
    { label: 'Dinheiro', href: '/dashboard/dinheiro' },
    { label: 'Minha equipe', href: '/dashboard/minha-equipe' },
    { label: 'Perfil', href: '/dashboard/perfil' },
  ];
}

export default async function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  const { supabase, user, profile } = await getSessionProfile();

  const opportunitiesCount =
    profile.role === 'booker' ? await getUnseenOpportunitiesCount(supabase, user.id) : 0;
  const navItems = navItemsFor(profile.role, opportunitiesCount);

  return (
    <div className="min-h-screen bg-[var(--paper)] font-doopla-sans text-[var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line-light)] px-6 py-4 sm:px-10">
        <Link href="/dashboard" className="font-doopla-display text-xl font-semibold">
          doopla
        </Link>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-doopla-mono rounded-full px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/70 hover:bg-[var(--paper-dim)] hover:text-[var(--ink)]"
            >
              {item.label}
              {!!item.badge && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--ink)]">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
          <Link
            href={profile.role === 'booker' ? '/dashboard/propor' : '/dashboard/publicar'}
            className="font-doopla-mono ml-1 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-[11px] font-medium uppercase tracking-[.06em] text-[var(--ink)] transition-opacity hover:opacity-90"
          >
            + Tenho um trabalho
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
