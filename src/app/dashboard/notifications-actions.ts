'use server';

import { getCommunityAuthors, listCommunityNotifications, listCommunityTopicsByIds, markCommunityNotificationRead } from '@/lib/community/data';

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

function notificationMessage(type: string, actorName: string, topicTitle: string): string {
  if (type === 'mention') return `${actorName} mencionou você em "${topicTitle}"`;
  if (type === 'reply_to_post') return `${actorName} respondeu sua mensagem em "${topicTitle}"`;
  return `${actorName} respondeu seu tópico "${topicTitle}"`;
}

export async function listNotificationsAction(): Promise<NotificationCard[]> {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role === 'booker') return [];

  const notifications = await listCommunityNotifications(supabase);
  if (notifications.length === 0) return [];

  const [authorsById, topics] = await Promise.all([
    getCommunityAuthors(supabase, [...new Set(notifications.map((n) => n.actorProfileId))]),
    listCommunityTopicsByIds(supabase, [...new Set(notifications.map((n) => n.topicId))]),
  ]);
  const topicById = new Map(topics.map((t) => [t.id, t]));

  return notifications.map((n) => {
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
