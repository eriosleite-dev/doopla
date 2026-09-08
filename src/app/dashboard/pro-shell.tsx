import Link from 'next/link';
import type { ReactNode } from 'react';

import { logoutAction } from '@/app/auth/actions';

import { DebugFetchLog } from './debug-fetch-log';
import { DebugMainProbe } from './debug-main-probe';
import { NotificationBell } from './notification-bell';
import { proNavIcons, ProSidebarNav, type ProNavLink } from './pro-sidebar-nav';
import { ProSidebarReferralLink } from './pro-sidebar-referral-link';
import { initialsFromName } from './ui';

export function ProfessionalShell({
  fullName,
  email,
  avatarUrl,
  hasDooplaPro,
  bookingsAwaitingCount,
  decisionsCount,
  referralEligible,
  children,
}: {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  // Entitlement já resolvido pela autoridade canônica (migration 0074,
  // hasDooplaPro() em src/lib/subscription.ts) — nunca um plan string
  // cru de novo aqui (era o bug: subscriptionPlan==='pro' ignorava
  // status/trial).
  hasDooplaPro: boolean;
  bookingsAwaitingCount: number;
  decisionsCount: number;
  referralEligible: boolean;
  children: ReactNode;
}) {
  const primaryLinks: ProNavLink[] = [
    { href: '/dashboard', label: 'Início', icon: proNavIcons.inicio },
    { href: '/dashboard/trabalhos', label: 'Bookings', icon: proNavIcons.bookings, badge: bookingsAwaitingCount },
    { href: '/dashboard/agenda', label: 'Agenda', icon: proNavIcons.agenda },
    {
      href: '/dashboard/decisoes',
      label: 'Decisões',
      icon: proNavIcons.decisoes,
      badge: decisionsCount,
    },
    { href: '/dashboard/dinheiro', label: 'Financeiro', icon: proNavIcons.financeiro },
    // Materiais/Analytics: arquitetura de informação aprovada (review
    // 04/09/2026) — a tela real ainda não existe, então o item fica
    // visível mas não navega ("Em breve", mesmo padrão de
    // PlaceholderScreen no App). Nunca removido silenciosamente, nunca
    // uma página fingindo existir.
    { href: '/dashboard/materiais', label: 'Materiais', icon: proNavIcons.materiais, comingSoon: true },
    { href: '/dashboard/analytics', label: 'Analytics', icon: proNavIcons.analytics, comingSoon: true },
  ];

  const secondaryLinks: ProNavLink[] = [
    { href: '/dashboard/bookers', label: 'Minha equipe', icon: proNavIcons.equipe },
    { href: '/dashboard/perfil', label: 'Configurações', icon: proNavIcons.configuracoes },
  ];

  return (
    <div className="pro-shell pro-glow-bg flex min-h-screen flex-col font-pro-body md:flex-row">
      <aside className="flex flex-col gap-5 border-b border-[var(--pro-line)] px-3.5 py-4 md:sticky md:top-0 md:h-screen md:w-[250px] md:flex-none md:overflow-y-auto md:border-r md:border-b-0 md:px-3.5 md:py-[18px]">
        <div className="flex items-center justify-between px-2 pb-1">
          {/* Nenhum asset de logo oficial reutilizável existe no
              repositório (auditado 04/09/2026: public/ e mobile/assets/
              só têm ícones default do Expo, nunca customizados; o único
              componente de marca, EyeLogo em src/app/_home/EyeLogo.tsx,
              depende de CSS escopado a #home-marketing/#site-chrome e
              renderiza sem estilo nenhum fora dali — não é um asset
              portável). Por instrução explícita (review 04/09/2026):
              nunca desenhar um wordmark novo pra substituir isso.
              Tratamento honesto temporário: texto simples, sem
              tipografia/peso de marca — só um link funcional de volta
              pra Início, não uma tentativa de logo. Pendência de asset
              real registrada no relatório final. */}
          <Link href="/dashboard" aria-label="Ir para Início" className="text-[13px] text-[var(--pro-tx-50)]">
            doopla
            <span className="font-doopla-mono ml-1.5 text-[8.5px] uppercase tracking-[.04em] text-[var(--pro-tx-30)]">
              (logo pendente)
            </span>
          </Link>
          <form action={logoutAction} className="md:hidden">
            <button
              type="submit"
              className="font-doopla-mono rounded-full border border-[var(--pro-line)] px-3 py-1.5 text-[10px] uppercase tracking-[.06em] text-[var(--pro-tx-70)]"
            >
              Sair
            </button>
          </form>
        </div>

        <ProSidebarNav links={primaryLinks} />

        <div className="h-px bg-[var(--pro-line)]" />

        <ProSidebarNav links={secondaryLinks} />
        {referralEligible && (
          <div className="-mt-4">
            <ProSidebarReferralLink />
          </div>
        )}

        <div className="flex-1 md:min-h-2" />

        <Link
          href="/dashboard/perfil"
          className="flex items-center gap-2.5 rounded-[10px] border border-[var(--pro-line)] bg-white/[0.04] px-2.5 py-2"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-[30px] w-[30px] flex-none rounded-full object-cover" />
          ) : (
            <span className="font-pro-sub flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[var(--pro-red)] text-[11px] font-semibold text-[var(--pro-off)]">
              {initialsFromName(fullName || email)}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-pro-sub truncate text-[12.5px] font-bold leading-tight">{fullName || email}</p>
          </div>
          {hasDooplaPro && (
            <span className="font-doopla-mono ml-auto flex-none rounded-[4px] border border-[rgba(226,41,28,.4)] px-1.5 py-[1px] text-[9px] font-bold text-[var(--pro-red)]">
              PRO
            </span>
          )}
        </Link>

        <form action={logoutAction} className="hidden md:block">
          <button
            type="submit"
            className="font-doopla-mono w-full rounded-full border border-[var(--pro-line)] px-4 py-2 text-[11px] uppercase tracking-[.06em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            Sair
          </button>
        </form>
      </aside>

      <div className="flex flex-1 flex-col md:flex-row">
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-7">
          <div className="mb-4 flex items-center justify-end gap-2.5">
            <NotificationBell />
            <Link
              href="/dashboard/comunidade"
              aria-label="Comunidade"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="9" cy="8" r="3" />
                <circle cx="17" cy="9" r="2.6" />
                <path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" />
                <path d="M14.5 14.6c2.7.4 4.3 2 5 5.4" />
              </svg>
            </Link>
            <Link
              href="/dashboard/perfil"
              aria-label="Configurações"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.2-.8.2-1.2z" />
              </svg>
            </Link>
          </div>

          {children}

          <footer className="mt-14 border-t border-[var(--pro-line)] pt-6 pb-2 text-[12px] text-[var(--pro-tx-30)]">
            © 2026 Doopla
          </footer>

          <DebugMainProbe />
          <DebugFetchLog />
        </main>
      </div>
    </div>
  );
}
