'use server';

import { countUnreadCommunityNotifications, getCommunityAuthors, listCommunityNotifications, listCommunityTopicsByIds, markCommunityNotificationRead } from '@/lib/community/data';
import type { CommunityNotificationType } from '@/lib/supabase/types';

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
//
// Correção 09/09/2026 (P1 "2 sinos", item h): esta é a ÚNICA leitura
// de notificações do Web — NotificationBell e CommunityNotificationsBell
// consomem via NotificationsProvider (notifications-context.tsx), nunca
// cada um buscando por conta própria. Devolve dados CRUS (actorName/
// topicTitle já resolvidos, mas sem mensagem/link formatados) — cada
// sino formata sua própria apresentação (ver notification-bell.tsx/
// community-notifications-bell.tsx), só a busca/estado são
// compartilhados.
export type NotificationEntry = {
  id: string;
  type: CommunityNotificationType;
  topicId: string;
  postId: string | null;
  actorName: string;
  topicTitle: string;
  unread: boolean;
  timeLabel: string;
};

// unreadCount SEMPRE vem de countUnreadCommunityNotifications — nunca
// derivado de items.filter() aqui nem no client. items é só um preview
// (últimas 20, ver COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT em
// src/lib/community/data.ts); uma não lida mais antiga que as 20 mais
// recentes existir sem aparecer no preview NÃO pode fazer o badge
// subcontar (correção 09/09/2026, P1 "paginação/limite real na query
// de notificações").
export type NotificationsResult = { items: NotificationEntry[]; unreadCount: number };

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

  const items = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    topicId: n.topicId,
    postId: n.postId,
    actorName: authorsById.get(n.actorProfileId)?.displayName ?? 'Um profissional Doopla',
    topicTitle: topicById.get(n.topicId)?.title ?? 'um tópico',
    unread: n.readAt === null,
    timeLabel: formatRelativeTime(n.createdAt),
  }));
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
