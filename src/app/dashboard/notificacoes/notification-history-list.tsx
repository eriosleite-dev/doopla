'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { CommunityNotificationType } from '@/lib/supabase/types';

import type { NotificationEntry } from '../notifications-actions';
import { loadNotificationHistoryPageAction } from '../notifications-actions';
import { useNotifications } from '../notifications-context';

function notificationCopy(type: CommunityNotificationType, actorName: string, topicTitle: string): string {
  if (type === 'mention') return `${actorName} mencionou você em "${topicTitle}"`;
  if (type === 'reply_to_post') return `${actorName} respondeu sua mensagem em "${topicTitle}"`;
  return `${actorName} respondeu seu tópico "${topicTitle}"`;
}

function notificationHref(entry: NotificationEntry): string {
  return `/dashboard/comunidade/${entry.topicId}${entry.postId ? `#msg-${entry.postId}` : ''}`;
}

// Histórico real (Notification Center, 01/10/2026) — lista plana,
// paginada via loadNotificationHistoryPageAction (.range() real,
// heurística de "acabou" por tamanho de página, mesmo padrão de
// mobile/app/forum/notificacoes.tsx). Marcar como lida usa o
// `markRead` do NotificationsProvider compartilhado (nunca uma
// mutação local isolada) — assim o badge do sino global também fica
// correto na próxima vez que ele buscar, mesmo que este item esteja
// fora do preview de 7 dias.
export function NotificationHistoryList({
  initialItems,
  initialHasMore,
}: {
  initialItems: NotificationEntry[];
  initialHasMore: boolean;
}) {
  const { markRead } = useNotifications();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  function handleClick(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, unread: false } : i)));
    markRead(id);
  }

  function loadMore() {
    setLoadingMore(true);
    loadNotificationHistoryPageAction(items.length)
      .then(({ items: more, hasMore: moreAvailable }) => {
        setItems((prev) => [...prev, ...more]);
        setHasMore(moreAvailable);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }

  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-[var(--pro-tx-50)]">Nenhuma notificação por aqui ainda.</p>;
  }

  return (
    <div>
      {items.map((item) => (
        <Link
          key={item.id}
          href={notificationHref(item)}
          onClick={() => handleClick(item.id)}
          className={`flex flex-col gap-1 border-b border-[var(--pro-line)] px-5 py-3.5 text-[13px] last:border-b-0 hover:bg-white/[.02] ${
            item.unread ? 'text-[var(--pro-off)]' : 'text-[var(--pro-tx-50)]'
          }`}
        >
          <span className="flex items-start gap-2">
            {item.unread && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pro-red)]" />}
            <span className={item.unread ? 'font-medium' : ''}>{notificationCopy(item.type, item.actorName, item.topicTitle)}</span>
          </span>
          <span className="font-doopla-mono pl-3.5 text-[10.5px] text-[var(--pro-tx-30)]">{item.timeLabel}</span>
        </Link>
      ))}
      {hasMore && (
        <div className="p-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-[12.5px] font-bold text-[var(--pro-red)] hover:underline disabled:opacity-50"
          >
            {loadingMore ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
}
