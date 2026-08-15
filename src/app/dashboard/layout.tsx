import Link from 'next/link';

import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

import { HelpPicker } from './help-picker';
import { JobPicker } from './job-picker';
import { getSessionProfile } from './session';
import { type SidebarGroup, SidebarNav } from './sidebar-nav';
import { avatarClass, initialsFromName } from './ui';

async function getOpportunitiesBadgeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: Profile['role']
): Promise<number> {
  if (role !== 'booker') return 0;

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

export default async function DashboardLayout({
  children,
}: LayoutProps<'/dashboard'>) {
  const { supabase, user, profile } = await getSessionProfile();

  const opportunitiesBadge = await getOpportunitiesBadgeCount(supabase, user.id, profile.role);

  const groups: SidebarGroup[] =
    profile.role === 'booker'
      ? [
          {
            label: 'Início',
            links: [
              { href: '/dashboard', label: 'Visão geral' },
              { href: '/dashboard/agenda', label: 'Agenda' },
            ],
          },
          {
            label: 'Trabalho',
            links: [
              { href: '/dashboard/trabalhos', label: 'Trabalhos' },
              { href: '/dashboard/oportunidades', label: 'Oportunidades', badge: opportunitiesBadge },
            ],
          },
          {
            label: 'Minha rede',
            links: [
              { href: '/dashboard/artistas', label: 'Artistas' },
              { href: '/dashboard/perfil', label: 'Meu perfil' },
            ],
          },
          {
            label: 'Financeiro',
            links: [{ href: '/dashboard/dinheiro', label: 'Ganhos' }],
          },
        ]
      : [
          {
            label: 'Início',
            links: [
              { href: '/dashboard', label: 'Visão geral' },
              { href: '/dashboard/agenda', label: 'Agenda' },
            ],
          },
          {
            label: 'Trabalho',
            links: [
              { href: '/dashboard/trabalhos', label: 'Trabalhos' },
              { href: '/dashboard/oportunidades', label: 'Oportunidades' },
            ],
          },
          {
            label: 'Minha rede',
            links: [
              { href: '/dashboard/bookers', label: 'Bookers' },
              { href: '/dashboard/perfil', label: 'Meu perfil' },
            ],
          },
          {
            label: 'Financeiro',
            links: [{ href: '/dashboard/dinheiro', label: 'Pagamentos' }],
          },
        ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)] font-doopla-sans text-[var(--ink)] md:flex-row">
      <aside className="flex flex-col gap-5 bg-[var(--sidebar)] px-5 py-6 text-[var(--paper)] md:sticky md:top-0 md:h-screen md:w-[272px] md:flex-none md:gap-6 md:overflow-y-auto md:px-5 md:py-7">
        <div className="flex items-center justify-between md:block">
          <Link href="/dashboard" className="font-doopla-display text-xl font-semibold">
            doopla
          </Link>
          <form action={logoutAction} className="md:hidden">
            <button
              type="submit"
              className="font-doopla-mono rounded-full border border-[var(--sidebar-line)] px-3 py-1.5 text-[10px] uppercase tracking-[.06em] text-[var(--paper)]/70"
            >
              Sair
            </button>
          </form>
        </div>

        <Link
          href="/dashboard/perfil"
          className="flex items-center gap-3 rounded-[14px] bg-white/[0.04] p-3.5"
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <span className={`${avatarClass} h-11 w-11`}>{initialsFromName(profile.full_name)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile.full_name || user.email}</p>
            <p className="font-doopla-mono text-[10px] uppercase tracking-[.06em] text-[var(--accent)]">
              {profile.role === 'booker' ? 'Booker' : 'Artista'}
            </p>
          </div>
        </Link>

        <SidebarNav groups={groups} />

        <div className="flex flex-col gap-3 md:mt-auto">
          {profile.role === 'booker' ? <JobPicker /> : <HelpPicker />}
          <form action={logoutAction} className="hidden md:block">
            <button
              type="submit"
              className="font-doopla-mono w-full rounded-full border border-[var(--sidebar-line)] px-4 py-2.5 text-[11px] uppercase tracking-[.06em] text-[var(--paper)]/60 hover:text-[var(--paper)]"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 px-6 py-10 sm:px-10 sm:py-12 md:max-w-[1180px]">{children}</div>
    </div>
  );
}
