'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useNotifications } from './notifications-context';
import type { NotificationEntry } from './notifications-actions';

function notificationMessage(entry: NotificationEntry): string {
  if (entry.type === 'mention') return `${entry.actorName} mencionou você em "${entry.topicTitle}"`;
  if (entry.type === 'reply_to_post') return `${entry.actorName} respondeu sua mensagem em "${entry.topicTitle}"`;
  return `${entry.actorName} respondeu seu tópico "${entry.topicTitle}"`;
}

// Correção de UX do sino (07/09/2026) — nunca mais navega pra Início:
// abre um popover ancorado no próprio ícone, sobre a página atual.
// Fonte compartilhada com CommunityNotificationsBell via
// NotificationsProvider (correção 09/09/2026, P1 "2 sinos") — este
// componente só formata mensagem/link, nunca busca ou guarda estado
// de notificação por conta própria.
export function NotificationBell() {
  const { phase, items, unreadCount, refresh, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
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

  function handleItemClick(id: string) {
    markRead(id);
    setOpen(false);
  }

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
          <span className="font-doopla-mono absolute -top-[3px] -right-[3px] flex h-4 w-4 items-center justify-center rounded-full bg-[var(--pro-red)] text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-50 w-[320px] rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] shadow-xl">
          <div className="border-b border-[var(--pro-line)] px-4 py-3">
            <p className="font-pro-sub text-[13px] font-bold text-[var(--pro-off)]">Notificações</p>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {phase === 'loading' && items.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">Carregando…</p>
            )}
            {phase === 'error' && items.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="mb-2 text-[12px] text-[var(--pro-tx-50)]">Não deu pra carregar suas notificações agora.</p>
                <button type="button" onClick={refresh} className="text-[12px] font-bold text-[var(--pro-off)] underline">
                  Tentar de novo
                </button>
              </div>
            )}
            {phase === 'ready' && items.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">Nenhuma notificação por aqui.</p>
            )}
            {items.length > 0 &&
              items.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/comunidade/${item.topicId}`}
                  onClick={() => handleItemClick(item.id)}
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
        </div>
      )}
    </div>
  );
}
