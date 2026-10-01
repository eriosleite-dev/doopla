'use server';

import { countUnreadCommunityNotifications, getCommunityAuthors, listCommunityNotifications, listCommunityTopicsByIds, markCommunityNotificationRead } from '@/lib/community/data';
import type { CommunityNotificationType } from '@/lib/supabase/types';

import { getCachedPendencyRows } from './pro-home-cache';
import { formatRelativeTime } from './pro-format';
import type { PendencyRow } from './pro-needs-you-list';
import { getSessionProfile } from './session';

// Notification Center (01/10/2026, composição aprovada pela
// fundadora) — duas fontes, nunca uma fundida na outra:
//
// 1. `communityItems`/`unreadCount` — community_notifications
// (migration 0059), evento persistido de verdade, com lido/não lido.
// Continua a ÚNICA leitura de notificações persistidas do Web
// (NotificationBell/CommunityNotificationsBell consomem via
// NotificationsProvider, nunca buscando por conta própria — correção
// 09/09/2026, P1 "2 sinos"). `unreadCount` SEMPRE vem de
// countUnreadCommunityNotifications — nunca derivado de
// communityItems.filter(), nem restrito aos últimos 7 dias (o badge do
// sino continua contando TODA notificação não lida, não só a janela
// recente do popover).
//
// 2. `needsYouRows`/`needsYouCount` — getCachedPendencyRows (mesma
// fonte canônica agora compartilhada com Home e o badge da sidebar,
// ver pendencies.ts). Estado derivado em tempo real, SEM read_at — ler
// um item de "Precisa de você" aqui não resolve a pendência (decisão
// explícita da fundadora: unread/needs_you/resolved continuam
// conceitos separados). Nunca inventa uma regra própria de needs_you —
// só reaproveita a mesma função que Home/sidebar já chamam.
//
// Comunidade é exclusiva de artista (mesmo gate de src/app/dashboard/
// comunidade/actions.ts) — booker nunca tem community_notifications
// (nunca ativa community_profiles) nem entra no cálculo de
// needs_you deste módulo (getCachedPendencyRows já é artista/agência
// only), então o sino aqui devolve tudo vazio pra booker em vez de
// estourar erro.
export type NotificationEntry = {
  id: string;
  type: CommunityNotificationType;
  topicId: string;
  postId: string | null;
  actorName: string;
  topicTitle: string;
  unread: boolean;
  timeLabel: string;
  createdAt: string;
};

// Janela do popover (spec aprovada: "últimos 7 dias") — só restringe
// o preview de Comunidade; needsYouRows nunca tem janela de tempo (é
// estado "agora", não um log de eventos).
const RECENT_WINDOW_DAYS = 7;

export type NotificationsResult = {
  communityItems: NotificationEntry[];
  unreadCount: number;
  needsYouRows: PendencyRow[];
  needsYouCount: number;
};

export async function listNotificationsAction(): Promise<NotificationsResult> {
  const { supabase, profile, user } = await getSessionProfile();
  if (profile.role === 'booker') return { communityItems: [], unreadCount: 0, needsYouRows: [], needsYouCount: 0 };

  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [notifications, unreadCount, needsYouRows] = await Promise.all([
    listCommunityNotifications(supabase, { since }),
    countUnreadCommunityNotifications(supabase),
    getCachedPendencyRows(user.id, profile, supabase),
  ]);
  const needsYouCount = needsYouRows.length;

  if (notifications.length === 0) return { communityItems: [], unreadCount, needsYouRows, needsYouCount };

  const [authorsById, topics] = await Promise.all([
    getCommunityAuthors(supabase, [...new Set(notifications.map((n) => n.actorProfileId))]),
    listCommunityTopicsByIds(supabase, [...new Set(notifications.map((n) => n.topicId))]),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const communityItems = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    topicId: n.topicId,
    postId: n.postId,
    actorName: authorsById.get(n.actorProfileId)?.displayName ?? 'Um profissional Doopla',
    topicTitle: topicById.get(n.topicId)?.title ?? 'um tópico',
    unread: n.readAt === null,
    timeLabel: formatRelativeTime(n.createdAt),
    createdAt: n.createdAt,
  }));
  return { communityItems, unreadCount, needsYouRows, needsYouCount };
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
