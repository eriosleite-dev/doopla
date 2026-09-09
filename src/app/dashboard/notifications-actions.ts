'use server';

import { countUnreadCommunityNotifications, getCommunityAuthors, listCommunityNotifications, listCommunityTopicsByIds, markCommunityNotificationRead } from '@/lib/community/data';

import { formatRelativeTime } from './pro-format';
import { getSessionProfile } from './session';

// Correção de UX do sino (07/09/2026), depois da inspeção pedida
// explicitamente antes de codar: o único sinal hoje com formato real de
// notificação (evento discreto, com autor, lido/não lido) é
// community_notifications (migration 0059) — já produzido de verdade
// por create_community_post (menção/resposta a post/resposta a tópico),
// mas nunca lido por nenhuma tela até agora. "Precisa de você" (Decisões)
// é um sinal operacional diferente (acionável -> resolvido, sem
// lido/não lido por item) e continua só nas suas superfícies já
// corretas (badge de Decisões, página Decisões, accordion da Home) —
// aprovado explicitamente pelo usuário não misturar os dois no V1 do
// sino, nem inventar notificação sintética pra Decisões só pra unificar.
//
// Comunidade é exclusiva de artista (mesmo gate de src/app/dashboard/
// comunidade/actions.ts) — booker nunca tem community_notifications
// (nunca ativa community_profiles), então o sino aqui devolve lista
// vazia pra booker em vez de estourar erro.
export type NotificationCard = {
  id: string;
  unread: boolean;
  message: string;
  timeLabel: string;
  href: string;
};

// unreadCount SEMPRE vem de countUnreadCommunityNotifications — nunca
// derivado de items.filter() aqui nem no client. items é só um preview
// (últimas 20, ver COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT em
// src/lib/community/data.ts); uma não lida mais antiga que as 20 mais
// recentes existir sem aparecer no preview NÃO pode fazer o badge
// subcontar (correção 09/09/2026, P1 "paginação/limite real na query
// de notificações").
export type NotificationsResult = { items: NotificationCard[]; unreadCount: number };

function notificationMessage(type: string, actorName: string, topicTitle: string): string {
  if (type === 'mention') return `${actorName} mencionou você em "${topicTitle}"`;
  if (type === 'reply_to_post') return `${actorName} respondeu sua mensagem em "${topicTitle}"`;
  return `${actorName} respondeu seu tópico "${topicTitle}"`;
}

export async function listNotificationsAction(): Promise<NotificationsResult> {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role === 'booker') return { items: [], unreadCount: 0 };

  const [notifications, unreadCount] = await Promise.all([
    listCommunityNotifications(supabase),
    countUnreadCommunityNotifications(supabase),
  ]);
  if (notifications.length === 0) return { items: [], unreadCount };

  const [authorsById, topics] = await Promise.all([
    getCommunityAuthors(supabase, [...new Set(notifications.map((n) => n.actorProfileId))]),
    listCommunityTopicsByIds(supabase, [...new Set(notifications.map((n) => n.topicId))]),
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
      href: `/dashboard/comunidade/${n.topicId}`,
    };
  });
  return { items, unreadCount };
}

export async function markNotificationReadAction(notificationId: string): Promise<{ ok: boolean }> {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role === 'booker') return { ok: false };
  try {
    await markCommunityNotificationRead(supabase, notificationId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
