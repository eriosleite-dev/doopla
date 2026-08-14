'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type SidebarLink = { href: string; label: string; badge?: number };

export function SidebarNav({ links }: { links: SidebarLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 overflow-x-auto md:mt-1 md:flex-col md:overflow-visible">
      <div className="flex gap-1 md:contents">
        {links.map((link) => {
          const active =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
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
        })}
      </div>
    </nav>
  );
}
