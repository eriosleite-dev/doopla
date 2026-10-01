'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useNotifications } from './notifications-context';
import type { NotificationEntry } from './notifications-actions';
import type { PendencyRow } from './pro-needs-you-list';

type Filter = 'todas' | 'precisa_de_voce' | 'comunidade';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'precisa_de_voce', label: 'Precisa de você' },
  { value: 'comunidade', label: 'Comunidade' },
];

function notificationMessage(entry: NotificationEntry): string {
  if (entry.type === 'mention') return `${entry.actorName} mencionou você em "${entry.topicTitle}"`;
  if (entry.type === 'reply_to_post') return `${entry.actorName} respondeu sua mensagem em "${entry.topicTitle}"`;
  return `${entry.actorName} respondeu seu tópico "${entry.topicTitle}"`;
}

// Deep link exato (spec aprovada: "nunca mandar pra uma tela genérica
// se conhecemos a entidade de origem") — inclui a âncora do post
// quando existe, mesmo padrão já usado por CommunityNotificationsBell.
// Antes este sino linkava só pro tópico, sem âncora — divergência sem
// motivo (CommunityNotificationsBell já tinha a âncora certa), unificado
// aqui.
function notificationHref(entry: NotificationEntry): string {
  return `/dashboard/comunidade/${entry.topicId}${entry.postId ? `#msg-${entry.postId}` : ''}`;
}

function formatBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

type DayGroup = 'Hoje' | 'Ontem' | 'Esta semana';
const DAY_GROUP_ORDER: DayGroup[] = ['Hoje', 'Ontem', 'Esta semana'];

function dayGroupOf(createdAt: string): DayGroup {
  const date = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return 'Hoje';
  if (date >= startOfYesterday) return 'Ontem';
  return 'Esta semana';
}

function groupByDay(items: NotificationEntry[]): { group: DayGroup; items: NotificationEntry[] }[] {
  const byGroup = new Map<DayGroup, NotificationEntry[]>();
  for (const item of items) {
    const group = dayGroupOf(item.createdAt);
    const list = byGroup.get(group) ?? [];
    list.push(item);
    byGroup.set(group, list);
  }
  return DAY_GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({ group, items: byGroup.get(group)! }));
}

// Notification Center (composição aprovada pela fundadora, 01/10/2026)
// — substitui o antigo NotificationBell (preview simples de
// Comunidade). Duas fontes visualmente distintas, nunca fundidas numa
// única semântica (decisão explícita):
//
// "Precisa de você" — pendência acionável, estado derivado em tempo
// real (getCachedPendencyRows, mesma fonte de Home/sidebar). Sem
// bolinha de não-lido (ler não resolve); usa o mesmo pill/tempo à
// direita que ProNeedsYouList já usa na Home. Abrir resolve na
// superfície canônica (deep link do próprio PendencyRow), nunca aqui
// dentro — este popover nunca é uma 2ª superfície de resolução.
//
// "Comunidade" — notificação persistida (community_notifications),
// com bolinha de não-lido de verdade, agrupada Hoje/Ontem/Esta semana
// (preview já vem restrito aos últimos 7 dias do servidor). Marcar
// como lida só existe aqui.
//
// Filtro "Trabalho" fora do V1 (decisão explícita: não criar uma tab
// fixa permanentemente vazia — sem modelo real de evento persistido
// de trabalho ainda). Sem busca nesta versão (popover continua curto/
// leve; busca faz mais sentido em /dashboard/notificacoes quando
// houver volume).
export function NotificationBell() {
  const { phase, communityItems, unreadCount, needsYouRows, needsYouCount, refresh, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('todas');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleCommunityClick(id: string) {
    markRead(id);
    setOpen(false);
  }

  const showNeedsYou = filter === 'todas' || filter === 'precisa_de_voce';
  const showCommunity = filter === 'todas' || filter === 'comunidade';
  const communityGroups = showCommunity ? groupByDay(communityItems) : [];
  const isEmpty =
    (!showNeedsYou || needsYouRows.length === 0) && (!showCommunity || communityItems.length === 0);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `${unreadCount} notificações não lidas` : 'Notificações'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="font-doopla-mono absolute -top-[3px] -right-[3px] flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pro-red)] px-1 text-[9px] font-bold text-white">
            {formatBadgeCount(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-50 w-[340px] rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] shadow-xl">
          <div className="flex flex-col gap-2.5 border-b border-[var(--pro-line)] px-4 py-3">
            <p className="font-pro-sub text-[13px] font-bold text-[var(--pro-off)]">Notificações</p>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilter(f.value)}
                    className={`font-doopla-mono rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.02em] transition-colors ${
                      active
                        ? 'bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                        : 'text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]'
                    }`}
                  >
                    {f.value === 'precisa_de_voce' ? `${f.label} (${needsYouCount})` : f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {phase === 'loading' && isEmpty && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">Carregando…</p>
            )}
            {phase === 'error' && isEmpty && (
              <div className="px-4 py-6 text-center">
                <p className="mb-2 text-[12px] text-[var(--pro-tx-50)]">Não deu pra carregar suas notificações agora.</p>
                <button type="button" onClick={refresh} className="text-[12px] font-bold text-[var(--pro-off)] underline">
                  Tentar de novo
                </button>
              </div>
            )}
            {phase === 'ready' && isEmpty && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">
                {filter === 'precisa_de_voce'
                  ? 'Nenhuma pendência agora.'
                  : filter === 'comunidade'
                    ? 'Nenhuma notificação recente aqui.'
                    : 'Nenhuma notificação por aqui.'}
              </p>
            )}

            {showNeedsYou && needsYouRows.length > 0 && (
              <div className="divide-y divide-[var(--pro-line)] border-b border-[var(--pro-line)]">
                {needsYouRows.map((row: PendencyRow) => (
                  <Link
                    key={row.id}
                    href={row.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-2.5 px-4 py-3 text-[12px] hover:bg-white/[.03]"
                  >
                    <p className="min-w-0 truncate text-[var(--pro-off)]">
                      <span className="font-pro-sub font-bold">{row.name}</span> — {row.detail}
                    </p>
                    {row.right.kind === 'pill' ? (
                      <span className={`flex-none ${row.right.className}`}>{row.right.label}</span>
                    ) : (
                      <span className="font-doopla-mono flex-none text-[10px] font-bold text-[var(--pro-tx-30)]">{row.right.label}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {showCommunity &&
              communityGroups.map(({ group, items: groupItems }) => (
                <div key={group}>
                  <p className="font-doopla-mono px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-[.05em] text-[var(--pro-tx-30)]">
                    {group}
                  </p>
                  {groupItems.map((item) => (
                    <Link
                      key={item.id}
                      href={notificationHref(item)}
                      onClick={() => handleCommunityClick(item.id)}
                      className={`flex flex-col gap-1 border-b border-[var(--pro-line)] px-4 py-3 text-[12px] last:border-b-0 hover:bg-white/[.03] ${
                        item.unread ? 'text-[var(--pro-off)]' : 'text-[var(--pro-tx-50)]'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        {item.unread && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pro-red)]" />}
                        <span className={item.unread ? 'font-medium' : ''}>{notificationMessage(item)}</span>
                      </span>
                      <span className="font-doopla-mono pl-3.5 text-[10px] text-[var(--pro-tx-30)]">{item.timeLabel}</span>
                    </Link>
                  ))}
                </div>
              ))}
          </div>

          <div className="border-t border-[var(--pro-line)] px-4 py-2.5 text-center">
            <Link
              href="/dashboard/notificacoes"
              onClick={() => setOpen(false)}
              className="font-pro-sub text-[12px] font-bold text-[var(--pro-red)] hover:underline"
            >
              Ver todas as notificações
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
