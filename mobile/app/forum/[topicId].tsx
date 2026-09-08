import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { BookmarkIcon, SendIcon } from '@/components/icons/Icons';
import { ErrorState, LoadingState } from '@/components/shared/ScreenState';
import { formatRelativeDate } from '@/lib/format';
import {
  communityContentVisibility,
  createCommunityPost,
  ensureCommunityProfileActivated,
  fetchCommunityAuthors,
  fetchCommunityPosts,
  fetchCommunityTopic,
  fetchSavedTopicIds,
  saveTopic,
  unsaveTopic,
  type CommunityAuthorSnapshot,
} from '@/lib/data/community';
import { useAuth } from '@/hooks/useAuth';
import type { CommunityPost, CommunityTopic } from '@/types/community';

type Phase = 'loading' | 'ready' | 'error';
type SendPhase = 'idle' | 'sending' | 'error';

// Comunidade — Fase 1 (06/09/2026). Substitui completamente a
// conversa mockada (forumMock.ts, deletado) — mesma RPC/tabela/RLS do
// painel web (create_community_post, migration 0059). Mentions e
// reply-to (a mensagens específicas) ficam pra Fase 3, conforme
// combinado — este responder é sempre uma mensagem simples no final
// do tópico, o parâmetro já existe na RPC pra quando essa UI existir.
export default function ForumConversationScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const router = useRouter();
  const { professionalId } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [topic, setTopic] = useState<CommunityTopic | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [authorsById, setAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendPhase, setSendPhase] = useState<SendPhase>('idle');

  const load = useCallback(async () => {
    if (!topicId) return;
    setPhase('loading');
    try {
      await ensureCommunityProfileActivated();
      const [t, p, savedIds] = await Promise.all([fetchCommunityTopic(topicId), fetchCommunityPosts(topicId), fetchSavedTopicIds()]);
      if (!t) {
        setPhase('error');
        return;
      }
      const authors = await fetchCommunityAuthors([...new Set([t.author_profile_id, ...p.map((post) => post.author_profile_id)])]);
      setTopic(t);
      setPosts(p);
      setAuthorsById(authors);
      setSaved(savedIds.includes(topicId));
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [topicId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function toggleSave() {
    if (!topicId) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    const action = wasSaved ? unsaveTopic(topicId) : saveTopic(topicId, professionalId ?? '');
    action.catch(() => setSaved(wasSaved));
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || sendPhase === 'sending' || !topicId) return;

    setSendPhase('sending');
    createCommunityPost({ topicId, body: text })
      .then(() => load())
      .then(() => {
        setDraft('');
        setSendPhase('idle');
      })
      .catch(() => setSendPhase('error'));
  }

  const isTopicRemoved = topic ? communityContentVisibility(topic.status) === 'removed' : false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title={topic?.title ?? 'Conversa'} onBack={() => router.back()} onClose={() => router.dismissAll()} />
      {phase === 'loading' && <LoadingState label="Carregando conversa…" />}
      {phase === 'error' && <ErrorState message="Não deu pra carregar essa conversa." onRetry={load} />}
      {phase === 'ready' && topic && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            <View style={styles.topicHead}>
              <Text style={styles.topicMeta}>
                {authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · {formatRelativeDate(topic.created_at)}
              </Text>
              <Pressable onPress={toggleSave} hitSlop={8}>
                <BookmarkIcon size={17} color={saved ? colors.red : colors.tx30} filled={saved} strokeWidth={1.8} />
              </Pressable>
            </View>
            {isTopicRemoved ? (
              <Text style={styles.removed}>Este tópico foi removido.</Text>
            ) : (
              <Text style={styles.topicBody}>{topic.body}</Text>
            )}

            {posts.map((post) => {
              const removed = communityContentVisibility(post.status) === 'removed';
              return (
                <View key={post.id} style={styles.message}>
                  <View style={styles.messageHead}>
                    <Text style={styles.author}>{authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla'}</Text>
                    <Text style={styles.time}>{formatRelativeDate(post.created_at)}</Text>
                  </View>
                  <Text style={removed ? styles.removed : styles.text}>{removed ? 'Mensagem removida.' : post.body}</Text>
                </View>
              );
            })}
            {sendPhase === 'error' && <ErrorState message="A mensagem não foi enviada." onRetry={handleSend} />}
          </ScrollView>
          {!isTopicRemoved && (
            <View style={styles.footer}>
              <TextInput
                style={styles.input}
                placeholder="Escreva uma mensagem..."
                placeholderTextColor={colors.tx50}
                accessibilityLabel="Escrever uma resposta"
                value={draft}
                onChangeText={setDraft}
                editable={sendPhase !== 'sending'}
              />
              <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sendPhase === 'sending'}>
                <SendIcon size={14} color={colors.off} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
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
  topicHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topicMeta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  topicBody: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  removed: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 12.5,
    marginBottom: 18,
  },
  message: {
    marginBottom: 16,
  },
  messageHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginBottom: 3,
  },
  author: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9.5,
  },
  text: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
