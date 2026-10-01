import Link from 'next/link';

import { getAdminSession } from './session';

// Painel Admin V1 — shell próprio, de propósito nunca o pro-shell do
// Professional (tema/variáveis --pro-* são do produto profissional,
// não fazem sentido pra uma superfície interna de operação). Web only
// nesta rodada (escopo aprovado), sem contraparte mobile.
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/comunidade', label: 'Comunidade' },
  { href: '/admin/ia-custo', label: 'Custo de IA' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await getAdminSession();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.08em] text-zinc-500">Doopla</p>
            <p className="text-sm font-semibold">Painel Admin</p>
          </div>
          <nav className="flex gap-4 text-[13px]">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="text-zinc-400 hover:text-zinc-100">
                {item.label}
              </Link>
            ))}
            <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-300">
              Voltar ao Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
