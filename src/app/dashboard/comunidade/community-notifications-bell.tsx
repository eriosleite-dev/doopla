'use client';

import Link from 'next/link';
import { useState } from 'react';

import { markCommunityNotificationReadAction, type CommunityNotificationCard } from './actions';

// Notificações da Comunidade (08/09/2026) — schema/RPC já existiam
// desde a migration 0059 (community_notifications, mark_community_notification_read),
// nunca conectados a nenhuma tela. Escopo só Comunidade — nunca a
// central de notificações genérica do produto (NotificationBell em
// pro-shell.tsx é outro sistema, outras tabelas, nunca misturados
// aqui). Estado local seedado uma vez do Server Component (page.tsx) —
// sem polling/realtime, mesmo padrão já aceito no resto da Comunidade.
export function CommunityNotificationsBell({ initialNotifications }: { initialNotifications: CommunityNotificationCard[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  function handleOpenNotification(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    // Fire-and-forget — otimista, mesmo padrão de SaveTopicButton/DeleteMenu
    // no resto da Comunidade. Falha de rede não desfaz o estado local: o
    // pior caso é a notificação continuar contando como não lida no
    // servidor até o próximo clique, nunca um bloqueio de navegação.
    void markCommunityNotificationReadAction(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações da Comunidade"
        aria-expanded={open}
        className="relative flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[var(--pro-line)] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="font-doopla-mono absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pro-red)] px-1 text-[9px] font-bold text-[var(--pro-off)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Fecha ao clicar fora — mesmo idioma dos outros overlays da
             Comunidade (DeleteMenu), sem lib nova. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="listbox"
            aria-label="Notificações"
            className="absolute right-0 top-full z-20 mt-2 max-h-[320px] w-[300px] overflow-y-auto rounded-[12px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.35)]"
          >
            {notifications.length === 0 ? (
              <p className="px-2.5 py-3 text-[12px] text-[var(--pro-tx-30)]">Nenhuma notificação por aqui ainda.</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => handleOpenNotification(n.id)}
                  className={`block rounded-[8px] px-2.5 py-2 text-[12px] leading-snug hover:bg-white/[0.05] ${
                    n.readAt ? 'text-[var(--pro-tx-50)]' : 'text-[var(--pro-off)]'
                  }`}
                >
                  <span className="flex items-start gap-1.5">
                    {!n.readAt && <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pro-red)]" aria-hidden="true" />}
                    <span className="min-w-0">
                      {n.text}
                      <span className="font-doopla-mono mt-0.5 block text-[10px] text-[var(--pro-tx-30)]">{n.timeLabel}</span>
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
