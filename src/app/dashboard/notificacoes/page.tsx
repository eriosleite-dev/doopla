import type { Metadata } from 'next';
import Link from 'next/link';

import { getCachedPendencyRows } from '../pro-home-cache';
import { loadNotificationHistoryPageAction } from '../notifications-actions';
import { ProCard, ProEmptyState, ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { NotificationHistoryList } from './notification-history-list';

export const metadata: Metadata = {
  title: 'Notificações | Doopla',
};

// Notification Center — histórico (01/10/2026, composição aprovada
// pela fundadora): esta página nunca mistura os dois conceitos numa
// lista só. "Precisa de você agora" é estado derivado em tempo real
// (getCachedPendencyRows, mesma fonte de Home/sidebar/popover) — sem
// paginação, sem histórico artificial, resolve por deep link na
// superfície canônica (nunca aqui). "Histórico de notificações" é só
// Comunidade (único evento persistido de verdade hoje), com paginação
// real. O CTA "Ver todas as notificações" do sino abre esta página em
// qualquer filtro que ele estiver.
export default async function NotificacoesPage() {
  const { supabase, user, profile } = await getSessionProfile();

  const [pendencyRows, firstPage] = await Promise.all([
    getCachedPendencyRows(user.id, profile, supabase),
    loadNotificationHistoryPageAction(0),
  ]);

  return (
    <main className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard"
          className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
        >
          ← Voltar pro painel
        </Link>
      </div>

      <ProPageHeader title="Notificações" subtitle="Pendências que precisam de você agora e o histórico de atividade da Comunidade." />

      <section className="flex flex-col gap-3">
        <h2 className="font-pro-sub text-[15px] font-bold text-[var(--pro-off)]">Precisa de você agora</h2>
        {pendencyRows.length === 0 ? (
          <ProEmptyState message="Tudo certo por aqui." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {pendencyRows.map((row) => (
              <Link
                key={row.id}
                href={row.href}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--pro-line)] bg-[var(--pro-panel)] px-4 py-3 transition-colors hover:border-[var(--pro-off)]/30"
              >
                <p className="min-w-0 truncate text-[13px] text-[var(--pro-off)]">
                  <span className="font-pro-sub font-bold">{row.name}</span> — {row.detail}
                </p>
                {row.right.kind === 'pill' ? (
                  <span className={`flex-none ${row.right.className}`}>{row.right.label}</span>
                ) : (
                  <span className="font-doopla-mono flex-none text-[10.5px] font-bold text-[var(--pro-tx-30)]">{row.right.label}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-pro-sub text-[15px] font-bold text-[var(--pro-off)]">Histórico de notificações</h2>
        <ProCard className="p-0 sm:p-0">
          <NotificationHistoryList initialItems={firstPage.items} initialHasMore={firstPage.hasMore} />
        </ProCard>
      </section>
    </main>
  );
}
