'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listNotificationsAction, markNotificationReadAction, type NotificationCard } from './notifications-actions';

type Phase = 'loading' | 'ready' | 'error';

// Correção de UX do sino (07/09/2026) — nunca mais navega pra Início:
// abre um popover ancorado no próprio ícone, sobre a página atual.
// Fonte única: community_notifications, via notifications-actions.ts
// (ver comentário lá sobre por que Decisões não entra aqui no V1).
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<NotificationCard[]>([]);
  // Nunca derivado de items.filter() — items é só um preview (últimas
  // 20), unreadCount vem de uma contagem exata separada no servidor
  // (ver notifications-actions.ts). Só decrementado localmente quando
  // o item marcado como lido estava, de fato, no preview e não lido.
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setPhase('loading');
    listNotificationsAction()
      .then(({ items: data, unreadCount: count }) => {
        setItems(data);
        setUnreadCount(count);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  // Carrega uma vez ao montar — o badge de não lidas precisa existir
  // mesmo com o popover fechado, nunca só depois de abrir.
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

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
    setItems((prev) => {
      const clicked = prev.find((i) => i.id === id);
      if (clicked?.unread) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.map((i) => (i.id === id ? { ...i, unread: false } : i));
    });
    markNotificationReadAction(id).catch(() => {});
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
            {phase === 'loading' && <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">Carregando…</p>}
            {phase === 'error' && (
              <div className="px-4 py-6 text-center">
                <p className="mb-2 text-[12px] text-[var(--pro-tx-50)]">Não deu pra carregar suas notificações agora.</p>
                <button type="button" onClick={load} className="text-[12px] font-bold text-[var(--pro-off)] underline">
                  Tentar de novo
                </button>
              </div>
            )}
            {phase === 'ready' && items.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--pro-tx-50)]">Nenhuma notificação por aqui.</p>
            )}
            {phase === 'ready' &&
              items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => handleItemClick(item.id)}
                  className={`flex flex-col gap-1 border-b border-[var(--pro-line)] px-4 py-3 text-[12px] last:border-b-0 hover:bg-white/[.03] ${
                    item.unread ? 'text-[var(--pro-off)]' : 'text-[var(--pro-tx-50)]'
                  }`}
                >
                  <span className="flex items-start gap-2">
                    {item.unread && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pro-red)]" />}
                    <span className={item.unread ? 'font-medium' : ''}>{item.message}</span>
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
