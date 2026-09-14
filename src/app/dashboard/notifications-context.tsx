'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { listNotificationsAction, markNotificationReadAction, type NotificationEntry } from './notifications-actions';

type Phase = 'loading' | 'ready' | 'error';

type NotificationsContextValue = {
  phase: Phase;
  items: NotificationEntry[];
  unreadCount: number;
  refresh: () => void;
  markRead: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Fonte única dos "2 sinos" do Web (NotificationBell no topbar global +
// CommunityNotificationsBell só em /dashboard/comunidade) — correção
// 09/09/2026, P1 item (h). Antes, cada um fazia sua própria busca +
// guardava seu próprio estado local: marcar uma notificação como lida
// num sino não refletia no outro, e os dois ficam visíveis AO MESMO
// TEMPO em /dashboard/comunidade (topbar global + header da própria
// página) — podiam mostrar contagens/status divergentes pra mesma
// notificação até o próximo reload inteiro da página. Montado uma vez
// em layout.tsx (mesmo padrão já usado por ProModalProvider/
// ReferralModalProvider), escopado à árvore não-booker. Cada sino
// continua livre pra formatar sua própria mensagem/link (ver
// notification-bell.tsx/community-notifications-bell.tsx) — só a
// busca/estado/mutação são compartilhados, nunca a apresentação.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    setPhase('loading');
    listNotificationsAction()
      .then(({ items: data, unreadCount: count }) => {
        setItems(data);
        setUnreadCount(count);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  // Carrega uma vez ao montar o provider (nunca por sino individual) —
  // o badge de não lidas precisa existir mesmo antes de qualquer sino
  // ser aberto ou de a Comunidade ser visitada nesta sessão.
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  function markRead(id: string) {
    setItems((prev) => {
      const clicked = prev.find((i) => i.id === id);
      if (clicked?.unread) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.map((i) => (i.id === id ? { ...i, unread: false } : i));
    });
    // Fire-and-forget — otimista, mesmo padrão já usado no resto da
    // Comunidade (SaveTopicButton/DeleteMenu). Falha de rede não
    // desfaz o estado local: pior caso é a notificação continuar
    // "não lida" no servidor até o próximo clique, nunca um bloqueio
    // de navegação.
    markNotificationReadAction(id).catch(() => {});
  }

  return (
    <NotificationsContext.Provider value={{ phase, items, unreadCount, refresh, markRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications precisa estar dentro de <NotificationsProvider>.');
  return ctx;
}
