import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { ForumTopicRow } from '@/components/forum/ForumTopicRow';
import { ErrorState, LoadingState, EmptyState } from '@/components/shared/ScreenState';
import { formatRelativeDate } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchCommunityAuthors,
  fetchCommunityTopicsByIds,
  fetchSavedTopicIds,
  removeCommunityTopic,
  unsaveTopic,
  type CommunityAuthorSnapshot,
} from '@/lib/data/community';
import type { CommunityTopic } from '@/types/community';

type Phase = 'loading' | 'ready' | 'error';

// Comunidade — Fase 1 (06/09/2026). Área dedicada de "Salvos", mesma
// fonte (community_saved_topics) que o preview na Home e o botão de
// salvar em qualquer tela — nunca um estado local/paralelo.
export default function ForumSalvosScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [authorsById, setAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [deletingTopicIds, setDeletingTopicIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const ids = await fetchSavedTopicIds();
      const list = await fetchCommunityTopicsByIds(ids, 100);
      const authors = await fetchCommunityAuthors([...new Set(list.map((t) => t.author_profile_id))]);
      setTopics(list);
      setAuthorsById(authors);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function handleUnsave(topicId: string) {
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
    unsaveTopic(topicId).catch(() => load());
  }

  // Item 6 (08/09/2026, correção do ••• ausente nos cards) — mesmo
  // padrão de forum/index.tsx e forum/[topicId].tsx.
  function handleDeleteTopic(topicId: string) {
    if (deletingTopicIds.has(topicId)) return;
    Alert.alert('Excluir tópico?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          setDeletingTopicIds((prev) => new Set(prev).add(topicId));
          removeCommunityTopic(topicId)
            .then(() => {
              setTopics((prev) => prev.filter((t) => t.id !== topicId));
            })
            .catch(() => {
              Alert.alert('Não foi possível excluir', 'Tente novamente.');
            })
            .finally(() => {
              setDeletingTopicIds((prev) => {
                const next = new Set(prev);
                next.delete(topicId);
                return next;
              });
            });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Salvos" onBack={() => router.back()} onClose={() => router.dismissAll()} />
      <View style={styles.body}>
        {phase === 'loading' && <LoadingState label="Carregando salvos…" />}
        {phase === 'error' && <ErrorState message="Não deu pra carregar seus salvos agora." onRetry={load} />}
        {phase === 'ready' && topics.length === 0 && (
          <EmptyState title="Nenhum tópico salvo" subtitle="Toque no marcador em qualquer tópico da Comunidade pra guardá-lo aqui." />
        )}
        {phase === 'ready' &&
          topics.map((topic, i) => (
            <ForumTopicRow
              key={topic.id}
              title={topic.title}
              meta={`${authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · ${topic.reply_count} ${
                topic.reply_count === 1 ? 'resposta' : 'respostas'
              }`}
              lastActivity={formatRelativeDate(topic.last_activity_at)}
              saved
              onToggleSave={() => handleUnsave(topic.id)}
              bordered={i > 0}
              onPress={() => router.push(`/forum/${topic.id}`)}
              onDelete={topic.author_profile_id === professionalId ? () => handleDeleteTopic(topic.id) : undefined}
              deleting={deletingTopicIds.has(topic.id)}
            />
          ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  body: {
    flex: 1,
    padding: 16,
  },
});
