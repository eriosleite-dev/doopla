import { countUnreadCommunityNotifications, fetchCommunityAuthors, fetchCommunityNotifications, fetchCommunityTopicsByIds, markCommunityNotificationRead } from './community';

export { markCommunityNotificationRead };

// Correção de UX do sino (07/09/2026) — espelha
// src/app/dashboard/notifications-actions.ts (painel web): mesma fonte
// única (community_notifications, migration 0059), mesmo enriquecimento
// (autor real via fetchCommunityAuthors, título real via
// fetchCommunityTopicsByIds), mesmas 3 mensagens por tipo. Decisões
// ("Precisa de você") continua fora do sino no V1 — aprovado
// explicitamente pelo usuário, mesma decisão em Web e App.
export type NotificationCard = {
  id: string;
  unread: boolean;
  message: string;
  timeLabel: string;
  topicId: string;
};

// unreadCount SEMPRE vem de countUnreadCommunityNotifications — nunca
// derivado de items.filter() aqui nem no client. items é só um preview
// (últimas 20, ver COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT em
// @/lib/data/community); uma não lida mais antiga que as 20 mais
// recentes existir sem aparecer no preview NÃO pode fazer o badge
// subcontar (correção 09/09/2026, P1 "paginação/limite real na query
// de notificações").
export type NotificationCardsResult = { items: NotificationCard[]; unreadCount: number };

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.floor(hours / 24)}d`;
}

function notificationMessage(type: string, actorName: string, topicTitle: string): string {
  if (type === 'mention') return `${actorName} mencionou você em "${topicTitle}"`;
  if (type === 'reply_to_post') return `${actorName} respondeu sua mensagem em "${topicTitle}"`;
  return `${actorName} respondeu seu tópico "${topicTitle}"`;
}

export async function fetchNotificationCards(): Promise<NotificationCardsResult> {
  const [notifications, unreadCount] = await Promise.all([fetchCommunityNotifications(), countUnreadCommunityNotifications()]);
  if (notifications.length === 0) return { items: [], unreadCount };

  const [authorsById, topics] = await Promise.all([
    fetchCommunityAuthors([...new Set(notifications.map((n) => n.actorProfileId))]),
    fetchCommunityTopicsByIds([...new Set(notifications.map((n) => n.topicId))]),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const items = notifications.map((n) => {
    const actorName = authorsById.get(n.actorProfileId)?.displayName ?? 'Um profissional Doopla';
    const topicTitle = topicById.get(n.topicId)?.title ?? 'um tópico';
    return {
      id: n.id,
      unread: n.readAt === null,
      message: notificationMessage(n.type, actorName, topicTitle),
      timeLabel: formatRelativeTime(n.createdAt),
      topicId: n.topicId,
    };
  });
  return { items, unreadCount };
}
