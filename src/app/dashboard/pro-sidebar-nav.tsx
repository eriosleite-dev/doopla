'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// comingSoon: destino aprovado na arquitetura de informação (spec
// section 1 da review de 04/09/2026), mas cuja tela real ainda não foi
// construída — item permanece visível na sidebar (nunca removido
// silenciosamente), só não navega pra lugar nenhum e mostra "Em breve"
// em vez de badge, mesmo padrão já usado em PlaceholderScreen no App
// (mobile/src/components/shared/PlaceholderScreen.tsx). href vira só
// documentação nesse caso (nunca usado pra navegar).
export type ProNavLink = { href: string; label: string; badge?: number; icon: React.ReactNode; comingSoon?: boolean };

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
} as const;

export const proNavIcons = {
  inicio: (
    <svg {...iconProps}>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  bookings: (
    <svg {...iconProps}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  agenda: (
    <svg {...iconProps}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4" />
    </svg>
  ),
  decisoes: (
    <svg {...iconProps}>
      <path d="M9 11l3 3L22 4M2 12l3 3 3-3" />
    </svg>
  ),
  financeiro: (
    <svg {...iconProps}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7H14a3.5 3.5 0 1 1 0 7H6" />
    </svg>
  ),
  equipe: (
    <svg {...iconProps}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" />
    </svg>
  ),
  configuracoes: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.2-.8.2-1.2z" />
    </svg>
  ),
  materiais: (
    <svg {...iconProps}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 10h6M9 14h6" />
    </svg>
  ),
  analytics: (
    <svg {...iconProps}>
      <path d="M3 17l6-6 4 4 8-8" />
    </svg>
  ),
};

function ProNavItem({ link }: { link: ProNavLink }) {
  const pathname = usePathname();
  const [path, hash] = link.href.split('#');
  // Bug real (review 04/09/2026): Decisões (href '/dashboard#precisa-de-voce')
  // ficava com o mesmo `path` de Início ('/dashboard') depois do split, então
  // caía no MESMO ramo do ternário e acendia como "ativo" sempre que a Home
  // estava aberta — mesmo sem o usuário ter clicado nele. Âncora de página
  // nunca é uma rota própria: link com hash nunca recebe o estado de nav
  // ativa (isso é estado de navegação, não de atenção/pendência — o badge
  // já cobre isso).
  const active = !hash && (path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(path));

  if (link.comingSoon) {
    return (
      <div
        aria-disabled="true"
        className="font-pro-sub flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-[var(--pro-tx-30)]"
      >
        <span className="[&>svg]:h-[17px] [&>svg]:w-[17px]">{link.icon}</span>
        {link.label}
        <span className="font-doopla-mono ml-auto rounded-full border border-[var(--pro-line)] px-1.5 py-[1px] text-[9px] uppercase tracking-[.04em] text-[var(--pro-tx-30)]">
          Em breve
        </span>
      </div>
    );
  }

  return (
    <Link
      href={link.href}
      className={`font-pro-sub relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold transition-colors ${
        active
          ? 'bg-gradient-to-r from-[rgba(226,41,28,.22)] to-[rgba(226,41,28,.04)] text-[var(--pro-off)] shadow-[inset_2px_0_0_var(--pro-red)]'
          : 'text-[var(--pro-tx-50)] hover:bg-white/[0.05] hover:text-[var(--pro-off)]'
      }`}
    >
      <span className="[&>svg]:h-[17px] [&>svg]:w-[17px]">{link.icon}</span>
      {link.label}
      {!!link.badge && link.badge > 0 && (
        <span className="font-doopla-mono ml-auto rounded-full bg-[var(--pro-red)] px-1.5 py-[1px] text-[10px] font-bold text-[var(--pro-off)] shadow-[0_0_10px_var(--pro-red-glow)]">
          {link.badge}
        </span>
      )}
    </Link>
  );
}

export function ProSidebarNav({ links }: { links: ProNavLink[] }) {
  return (
    <nav className="flex flex-col gap-[1px]">
      {links.map((link) => (
        <ProNavItem key={link.href} link={link} />
      ))}
    </nav>
  );
}
