'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SidebarLink = { href: string; label: string; badge?: number };
export type SidebarGroup = { label: string; links: SidebarLink[] };

function NavLink({ link }: { link: SidebarLink }) {
  const pathname = usePathname();
  const active =
    pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));

  return (
    <Link
      href={link.href}
      className={`flex flex-none items-center gap-2.5 whitespace-nowrap rounded-[10px] border-l-[3px] px-3 py-2.5 text-sm md:flex-1 ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/12 font-medium text-[var(--paper)]'
          : 'border-transparent text-[#c9c2b4] hover:text-[var(--paper)]'
      }`}
    >
      {link.label}
      {!!link.badge && link.badge > 0 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--ink)]">
          {link.badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({ groups }: { groups: SidebarGroup[] }) {
  return (
    <nav className="flex flex-col gap-4 overflow-x-auto md:mt-1 md:overflow-visible">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="font-doopla-mono hidden px-3 text-[10px] uppercase tracking-[.08em] text-[var(--paper)]/35 md:block">
            {group.label}
          </p>
          <div className="flex gap-1 md:contents">
            {group.links.map((link) => (
              <NavLink key={link.href} link={link} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
