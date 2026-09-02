import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { ForumTopicRow } from '@/components/forum/ForumTopicRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { mockForumChips, mockForumTopics } from '@/data/forumMock';

type Phase = 'loading' | 'ready' | 'error';

// Carregamento mockado (sem backend ainda) só pra deixar os estados
// loading/erro com retry realmente navegáveis, como pede o prompt do
// layout pro Fórum.
function loadTopics(): Promise<typeof mockForumTopics> {
  return new Promise((resolve) => setTimeout(() => resolve(mockForumTopics), 450));
}

export default function ForumTopicListScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [topics, setTopics] = useState<typeof mockForumTopics>([]);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState(mockForumChips[0]);

  const reload = useCallback(() => {
    setPhase('loading');
    loadTopics()
      .then((data) => {
        setTopics(data);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    return topics.filter((t) => {
      const matchesChip = activeChip === 'Todos' || t.meta.startsWith(activeChip);
      const matchesSearch = t.title.toLowerCase().includes(search.trim().toLowerCase());
      return matchesChip && matchesSearch;
    });
  }, [topics, activeChip, search]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Fórum" onClose={() => router.dismissAll()} />
      <View style={styles.body}>
        <TextInput
          style={styles.search}
          placeholder="Buscar tópicos..."
          placeholderTextColor={colors.tx50}
          value={search}
          onChangeText={setSearch}
        />
        <View style={styles.chips}>
          {mockForumChips.map((chip) => {
            const active = chip === activeChip;
            return (
              <Pressable key={chip} onPress={() => setActiveChip(chip)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip}</Text>
              </Pressable>
            );
          })}
        </View>

        {phase === 'loading' && <LoadingState label="Carregando tópicos…" />}
        {phase === 'error' && <ErrorState message="Não deu pra carregar o Fórum agora." onRetry={reload} />}
        {phase === 'ready' && filtered.length === 0 && (
          <EmptyState title="Nenhum tópico encontrado" subtitle="Tente outra busca ou categoria." />
        )}
        {phase === 'ready' &&
          filtered.map((topic, i) => (
            <ForumTopicRow
              key={topic.id}
              title={topic.title}
              meta={topic.meta}
              lastActivity={topic.lastActivity}
              hasNew={topic.hasNew}
              bordered={i > 0}
              onPress={() => router.push(`/forum/${topic.id}`)}
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
  search: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 12.5,
    color: colors.off,
    fontFamily: fonts.body,
    marginBottom: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  chipText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 11,
  },
  chipTextActive: {
    color: colors.off,
  },
});
