import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { ErrorState, LoadingState, EmptyState } from '@/components/shared/ScreenState';
import { formatRelativeDate } from '@/lib/format';
import {
  COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT,
  fetchCommunityAuthors,
  fetchCommunityNotifications,
  markCommunityNotificationRead,
  type CommunityAuthorSnapshot,
  type CommunityNotificationItem,
} from '@/lib/data/community';
import type { CommunityNotificationType } from '@/types/community';

type Phase = 'loading' | 'ready' | 'error';

// Única superfície do produto (Web ou App) que promete histórico
// completo de notificações — correção 09/09/2026 (P1 "paginação/limite
// real na query de notificações"): antes buscava tudo de uma vez
// (select('*') sem .range()), crescimento ilimitado. Agora pagina de
// verdade — "Carregar mais" busca a próxima leva, nunca trunca
// silenciosamente o histórico. Mesmo PAGE_SIZE do preview do sino, só
// pra reaproveitar o número já convencionado (não é o mesmo limite
// conceitualmente — aqui é tamanho de página, lá é teto do preview).
const PAGE_SIZE = COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT;

// Notificações da Comunidade (08/09/2026) — schema/RPC já existiam
// desde a migration 0059 (community_notifications,
// mark_community_notification_read), nunca conectados a nenhuma tela.
// Escopo só Comunidade — nunca a central de notificações genérica do
// produto. Cópia por tipo espelha exatamente o painel web
// (src/app/dashboard/comunidade/page.tsx), pra nunca divergir.
function notificationCopy(type: CommunityNotificationType, actorName: string): string {
  switch (type) {
    case 'reply_to_topic':
      return `${actorName} respondeu no seu tópico`;
    case 'reply_to_post':
      return `${actorName} respondeu sua mensagem`;
    case 'mention':
      return `${actorName} mencionou você`;
  }
}

export default function ForumNotificacoesScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [notifications, setNotifications] = useState<CommunityNotificationItem[]>([]);
  const [authorsById, setAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const list = await fetchCommunityNotifications({ limit: PAGE_SIZE, offset: 0 });
      const authors = await fetchCommunityAuthors([...new Set(list.map((n) => n.actorProfileId))]);
      setNotifications(list);
      setAuthorsById(authors);
      setHasMore(list.length === PAGE_SIZE);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  // "Carregar mais" — próxima leva a partir do offset atual (quantidade
  // já carregada), some sozinho quando uma página vem menor que
  // PAGE_SIZE (heurística padrão de "não tem mais", sem precisar de
  // contagem total/RPC nova).
  function loadMore() {
    setLoadingMore(true);
    fetchCommunityNotifications({ limit: PAGE_SIZE, offset: notifications.length })
      .then(async (list) => {
        const newActorIds = [...new Set(list.map((n) => n.actorProfileId))].filter((id) => !authorsById.has(id));
        if (newActorIds.length > 0) {
          const newAuthors = await fetchCommunityAuthors(newActorIds);
          setAuthorsById((prev) => new Map([...prev, ...newAuthors]));
        }
        setNotifications((prev) => [...prev, ...list]);
        setHasMore(list.length === PAGE_SIZE);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Otimista (mesmo padrão de toggleSave/handleDeleteTopic no resto da
  // Comunidade) — falha de rede não bloqueia a navegação, só deixa a
  // notificação "não lida" de novo no servidor até o próximo toque.
  function handleOpenNotification(notification: CommunityNotificationItem) {
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
    void markCommunityNotificationRead(notification.id);
    router.push(`/forum/${notification.topicId}`);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Notificações" onBack={() => router.back()} onClose={() => router.dismissAll()} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {phase === 'loading' && <LoadingState label="Carregando notificações…" />}
        {phase === 'error' && <ErrorState message="Não deu pra carregar suas notificações agora." onRetry={load} />}
        {phase === 'ready' && notifications.length === 0 && <EmptyState title="Nenhuma notificação por aqui ainda" />}
        {phase === 'ready' &&
          notifications.map((n, i) => (
            <Pressable
              key={n.id}
              onPress={() => handleOpenNotification(n)}
              style={[styles.row, i > 0 && styles.rowBordered]}
              accessibilityRole="button"
            >
              {!n.readAt && <View style={styles.unreadDot} accessibilityLabel="Não lida" />}
              <View style={styles.rowContent}>
                <Text style={[styles.rowText, !n.readAt && styles.rowTextUnread]}>
                  {notificationCopy(n.type, authorsById.get(n.actorProfileId)?.displayName ?? 'Profissional Doopla')}
                </Text>
                <Text style={styles.rowTime}>{formatRelativeDate(n.createdAt)}</Text>
              </View>
            </Pressable>
          ))}
        {phase === 'ready' && hasMore && (
          <Pressable style={styles.loadMoreBtn} onPress={loadMore} disabled={loadingMore} accessibilityRole="button">
            {loadingMore ? <ActivityIndicator color={colors.tx70} /> : <Text style={styles.loadMoreText}>Carregar mais</Text>}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  body: {
    flexGrow: 1,
    padding: 16,
  },
  loadMoreBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 12.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
  },
  rowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  unreadDot: {
    marginTop: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red,
  },
  rowContent: {
    flex: 1,
  },
  rowText: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  rowTextUnread: {
    color: colors.off,
  },
  rowTime: {
    marginTop: 2,
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 10.5,
  },
});
