import Link from 'next/link';

import { listAgencyApplications } from '@/lib/agencies/admin-data';

import { getAdminSession } from './session';

// Painel Admin V1 — shell próprio, de propósito nunca o pro-shell do
// Professional (tema/variáveis --pro-* são do produto profissional,
// não fazem sentido pra uma superfície interna de operação). Web only
// nesta rodada (escopo aprovado), sem contraparte mobile.
const NAV_ITEMS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/comunidade', label: 'Comunidade' },
  { href: '/admin/agencias', label: 'Agências Parceiras' },
  { href: '/admin/ia-custo', label: 'Custo de IA' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await getAdminSession();

  // Notificação dentro do próprio Admin (requisito explícito: nunca
  // depender só do e-mail/Resend) — inscrições prioritárias ainda não
  // avaliadas (status='new'), contadas a cada carregamento de
  // qualquer página do Admin. Nunca lança (best-effort): um erro aqui
  // nunca pode travar o Admin inteiro.
  let pendingPriorityCount = 0;
  try {
    const pending = await listAgencyApplications(supabase, { classification: 'priority', status: 'new', limit: 50 });
    pendingPriorityCount = pending.length;
  } catch {
    pendingPriorityCount = 0;
  }

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
              <Link key={item.href} href={item.href} className="relative text-zinc-400 hover:text-zinc-100">
                {item.label}
                {item.href === '/admin/agencias' && pendingPriorityCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingPriorityCount}
                  </span>
                )}
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
