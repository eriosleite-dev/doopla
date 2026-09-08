import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
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
  fetchCommunityMentions,
  fetchCommunityPostsByIds,
  fetchCommunityPostsPage,
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
type ReplyTarget = { postId: string; authorName: string; snippet: string };
type MentionCandidate = { profileId: string; displayName: string };
type ReplyToQuote = ReplyTarget & { removed: boolean };
type TrackedMention = { profileId: string; displayName: string; insertedText: string };
type MentionQuery = { start: number; query: string };

function snippetOf(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Espelha detectMentionQuery do painel web (mesmo critério: "@" no
// início de uma palavra, sem espaço entre ele e o cursor).
function detectMentionQuery(value: string, caret: number): MentionQuery | null {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? '' : upToCaret[at - 1];
  if (before && !/\s/.test(before)) return null;
  const between = upToCaret.slice(at + 1);
  if (/\s/.test(between)) return null;
  return { start: at, query: between };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

// Comunidade — Fase 1 (06/09/2026). Substitui completamente a
// conversa mockada (forumMock.ts, deletado) — mesma RPC/tabela/RLS do
// painel web (create_community_post, migration 0059).
//
// Item 5 (08/09/2026) — migra de ScrollView pra FlatList: precisamos
// de scrollToIndex pra tap-na-citação (jump-to-message), e uma
// ScrollView gigante nunca ofereceria isso de forma correta (só
// onLayout+scrollTo por item, frágil e não é a primitive certa aqui).
// Paginação sempre do início do tópico pra frente (mesmo desenho do
// Web, ver timeline.ts lá) — cada "carregar mais respostas" busca a
// PRÓXIMA leva, nunca a anterior. Como é sempre um prefixo contínuo
// desde o começo, o alvo de um reply-to já carregado SEMPRE existe em
// `posts` — jump-to-message nunca precisa lidar com "página não
// carregada".
//
// Enviar uma resposta nova NUNCA recarrega o tópico inteiro (evitaria
// perder páginas adicionais já carregadas) — quando o autor está "em
// dia" (hasMore === false), a resposta publicada é buscada pontualmente
// (fetchCommunityPostsByIds) e anexada ao fim de `posts`; quando não
// está em dia, ela é gravada normalmente mas só aparece quando o
// usuário continuar clicando "carregar mais" até alcançá-la (evita
// fingir uma posição cronológica que criaria um buraco na lista).
const PAGE_SIZE = 20;

export default function ForumConversationScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const router = useRouter();
  const { professionalId } = useAuth();
  const flatListRef = useRef<FlatList<CommunityPost>>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [topic, setTopic] = useState<CommunityTopic | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [authorsById, setAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [mentionsByPost, setMentionsByPost] = useState<Map<string, string[]>>(new Map());
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendPhase, setSendPhase] = useState<SendPhase>('idle');
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [mentioned, setMentioned] = useState<TrackedMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const load = useCallback(async () => {
    if (!topicId) return;
    setPhase('loading');
    try {
      await ensureCommunityProfileActivated();
      const [t, page, savedIds] = await Promise.all([
        fetchCommunityTopic(topicId),
        fetchCommunityPostsPage(topicId, { limit: PAGE_SIZE }),
        fetchSavedTopicIds(),
      ]);
      if (!t) {
        setPhase('error');
        return;
      }
      const authors = await fetchCommunityAuthors([...new Set([t.author_profile_id, ...page.posts.map((post) => post.author_profile_id)])]);
      const mentions = await fetchCommunityMentions(page.posts.map((post) => post.id));
      const mentionsMap = new Map<string, string[]>();
      for (const mention of mentions) {
        const name = authors.get(mention.mentioned_profile_id)?.displayName;
        if (!name) continue;
        mentionsMap.set(mention.post_id, [...(mentionsMap.get(mention.post_id) ?? []), name]);
      }
      setTopic(t);
      setPosts(page.posts);
      setHasMore(page.hasMore);
      setAuthorsById(authors);
      setMentionsByPost(mentionsMap);
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

  const postsById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!topic) return [];
    const ids = [...new Set([topic.author_profile_id, ...posts.map((post) => post.author_profile_id)])].filter(
      (id) => id !== professionalId
    );
    return ids
      .map((id) => authorsById.get(id))
      .filter((author): author is CommunityAuthorSnapshot => Boolean(author))
      .map((author) => ({ profileId: author.profileId, displayName: author.displayName }));
  }, [topic, posts, authorsById, professionalId]);

  function toggleSave() {
    if (!topicId) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    const action = wasSaved ? unsaveTopic(topicId) : saveTopic(topicId, professionalId ?? '');
    action.catch(() => setSaved(wasSaved));
  }

  async function handleLoadMore() {
    if (!topicId || loadingMore || !hasMore) return;
    const lastPost = posts[posts.length - 1];
    if (!lastPost) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await fetchCommunityPostsPage(topicId, {
        limit: PAGE_SIZE,
        after: { createdAt: lastPost.created_at, id: lastPost.id },
      });
      const mentions = await fetchCommunityMentions(page.posts.map((post) => post.id));
      const neededAuthorIds = new Set<string>();
      for (const post of page.posts) neededAuthorIds.add(post.author_profile_id);
      for (const mention of mentions) neededAuthorIds.add(mention.mentioned_profile_id);
      const missingAuthorIds = [...neededAuthorIds].filter((id) => !authorsById.has(id));
      const mergedAuthors =
        missingAuthorIds.length > 0 ? new Map([...authorsById, ...(await fetchCommunityAuthors(missingAuthorIds))]) : authorsById;

      const mergedMentions = new Map(mentionsByPost);
      for (const mention of mentions) {
        const name = mergedAuthors.get(mention.mentioned_profile_id)?.displayName;
        if (!name) continue;
        mergedMentions.set(mention.post_id, [...(mergedMentions.get(mention.post_id) ?? []), name]);
      }

      setAuthorsById(mergedAuthors);
      setMentionsByPost(mergedMentions);
      setPosts((prev) => [...prev, ...page.posts]);
      setHasMore(page.hasMore);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function jumpToMessage(postId: string) {
    const index = posts.findIndex((post) => post.id === postId);
    if (index === -1) return;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }

  const mentionSuggestions = mentionQuery
    ? mentionCandidates
        .filter((c) => c.displayName.toLocaleLowerCase('pt-BR').includes(mentionQuery.query.toLocaleLowerCase('pt-BR')))
        .slice(0, 6)
    : [];

  function handleDraftChange(text: string) {
    setDraft(text);
    setMentionQuery(detectMentionQuery(text, selection.end));
  }

  function selectMention(candidate: MentionCandidate) {
    if (!mentionQuery) return;
    const insertion = `@${candidate.displayName} `;
    const newText = draft.slice(0, mentionQuery.start) + insertion + draft.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    setDraft(newText);
    setMentioned((prev) => [...prev, { profileId: candidate.profileId, displayName: candidate.displayName, insertedText: insertion }]);
    setMentionQuery(null);
  }

  // Mesma lógica de "sobrevivência por contagem de ocorrência" do Web:
  // conta quantas vezes o literal inserido ainda existe no texto final
  // e só mantém, na ordem da seleção, tantas menções daquele texto
  // quantas ocorrências sobraram. Apagar o "@Nome " do rascunho
  // derruba a menção estruturada correspondente.
  function computeSurvivingMentionIds(text: string): string[] {
    const totalByText = new Map<string, number>();
    const claimedByText = new Map<string, number>();
    const survivors: string[] = [];
    for (const m of mentioned) {
      if (survivors.includes(m.profileId)) continue;
      if (!totalByText.has(m.insertedText)) totalByText.set(m.insertedText, countOccurrences(text, m.insertedText));
      const claimed = claimedByText.get(m.insertedText) ?? 0;
      if (claimed < (totalByText.get(m.insertedText) ?? 0)) {
        survivors.push(m.profileId);
        claimedByText.set(m.insertedText, claimed + 1);
      }
    }
    return survivors;
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sendPhase === 'sending' || !topicId) return;
    const survivingMentionIds = computeSurvivingMentionIds(draft);
    const caughtUp = !hasMore;

    setSendPhase('sending');
    try {
      const newPostId = await createCommunityPost({
        topicId,
        body: text,
        replyToPostId: replyTarget?.postId ?? null,
        mentionedProfileIds: survivingMentionIds,
      });

      if (caughtUp) {
        const idsToFetch = [newPostId, ...(replyTarget ? [replyTarget.postId] : [])];
        const rows = await fetchCommunityPostsByIds(idsToFetch);
        const newPost = rows.find((row) => row.id === newPostId);
        if (newPost) {
          const replyTargetRow = replyTarget ? rows.find((row) => row.id === replyTarget.postId) : undefined;
          const neededAuthorIds = new Set<string>(survivingMentionIds);
          if (professionalId) neededAuthorIds.add(professionalId);
          if (replyTargetRow) neededAuthorIds.add(replyTargetRow.author_profile_id);
          const missingAuthorIds = [...neededAuthorIds].filter((id) => !authorsById.has(id));
          const mergedAuthors =
            missingAuthorIds.length > 0 ? new Map([...authorsById, ...(await fetchCommunityAuthors(missingAuthorIds))]) : authorsById;

          if (survivingMentionIds.length > 0) {
            const names = survivingMentionIds.map((id) => mergedAuthors.get(id)?.displayName).filter((n): n is string => Boolean(n));
            if (names.length > 0) setMentionsByPost((prev) => new Map(prev).set(newPost.id, names));
          }
          setAuthorsById(mergedAuthors);
          setPosts((prev) => [...prev, newPost]);
        }
      }

      setDraft('');
      setReplyTarget(null);
      setMentioned([]);
      setMentionQuery(null);
      setSendPhase('idle');
    } catch {
      setSendPhase('error');
    }
  }

  function resolveReplyTo(post: CommunityPost): ReplyToQuote | null {
    if (!post.reply_to_post_id) return null;
    const target = postsById.get(post.reply_to_post_id);
    if (!target) return null;
    const removed = communityContentVisibility(target.status) === 'removed';
    return {
      postId: target.id,
      authorName: authorsById.get(target.author_profile_id)?.displayName ?? 'Profissional Doopla',
      snippet: removed ? '' : snippetOf(target.body),
      removed,
    };
  }

  function renderBodyWithMentions(body: string, names: string[]) {
    if (names.length === 0) return <Text style={styles.text}>{body}</Text>;
    const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g');
    const parts = body.split(pattern);
    return (
      <Text style={styles.text}>
        {parts.map((part, i) =>
          part.startsWith('@') && names.includes(part.slice(1)) ? (
            <Text key={i} style={styles.mention}>
              {part}
            </Text>
          ) : (
            <Text key={i}>{part}</Text>
          )
        )}
      </Text>
    );
  }

  const isTopicRemoved = topic ? communityContentVisibility(topic.status) === 'removed' : false;

  function renderPost({ item: post }: ListRenderItemInfo<CommunityPost>) {
    const removed = communityContentVisibility(post.status) === 'removed';
    const replyTo = resolveReplyTo(post);
    return (
      <View style={styles.message}>
        {replyTo && (
          <Pressable onPress={() => jumpToMessage(replyTo.postId)} style={styles.replyQuote} accessibilityRole="button">
            <Text style={styles.replyQuoteAuthor}>{replyTo.authorName}</Text>
            <Text style={styles.replyQuoteText}>{replyTo.removed ? 'Mensagem removida.' : `“${replyTo.snippet}”`}</Text>
          </Pressable>
        )}
        <View style={styles.messageHead}>
          <Text style={styles.author}>{authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla'}</Text>
          <Text style={styles.time}>{formatRelativeDate(post.created_at)}</Text>
        </View>
        {removed ? (
          <Text style={styles.removed}>Mensagem removida.</Text>
        ) : (
          renderBodyWithMentions(post.body, mentionsByPost.get(post.id) ?? [])
        )}
        {!removed && (
          <Pressable
            onPress={() =>
              setReplyTarget({
                postId: post.id,
                authorName: authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla',
                snippet: snippetOf(post.body),
              })
            }
            hitSlop={6}
            accessibilityRole="button"
          >
            <Text style={styles.replyButtonText}>Responder</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title={topic?.title ?? 'Conversa'} onBack={() => router.back()} onClose={() => router.dismissAll()} />
      {phase === 'loading' && <LoadingState label="Carregando conversa…" />}
      {phase === 'error' && <ErrorState message="Não deu pra carregar essa conversa." onRetry={load} />}
      {phase === 'ready' && topic && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={flatListRef}
            style={styles.body}
            contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
            data={posts}
            keyExtractor={(post) => post.id}
            renderItem={renderPost}
            onScrollToIndexFailed={(info) => {
              flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }}
            ListHeaderComponent={
              <View>
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
              </View>
            }
            ListFooterComponent={
              <>
                {hasMore && (
                  <View style={styles.loadMoreWrap}>
                    <Pressable onPress={handleLoadMore} disabled={loadingMore} accessibilityRole="button" accessibilityState={{ busy: loadingMore }}>
                      <Text style={styles.loadMoreText}>{loadingMore ? 'Carregando…' : 'Carregar mais respostas'}</Text>
                    </Pressable>
                    {loadMoreError && (
                      <View style={{ alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <Text style={styles.loadMoreErrorText}>Não deu pra carregar mais respostas.</Text>
                        <Pressable onPress={handleLoadMore} accessibilityRole="button">
                          <Text style={styles.retryText}>Tentar de novo</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
                {!isTopicRemoved && posts.length === 0 && !hasMore && (
                  <Text style={styles.noRepliesText}>Nenhuma resposta ainda. Seja o primeiro a responder.</Text>
                )}
                {sendPhase === 'error' && <ErrorState message="A mensagem não foi enviada." onRetry={handleSend} />}
              </>
            }
          />
          {!isTopicRemoved && (
            <View>
              {replyTarget && (
                <View style={styles.replyTargetBar}>
                  <Text style={styles.replyTargetText} numberOfLines={1}>
                    Respondendo a <Text style={styles.replyTargetAuthor}>{replyTarget.authorName}</Text>: “{replyTarget.snippet}”
                  </Text>
                  <Pressable onPress={() => setReplyTarget(null)} hitSlop={8} accessibilityLabel="Cancelar resposta" accessibilityRole="button">
                    <Text style={styles.cancelReplyText}>✕</Text>
                  </Pressable>
                </View>
              )}
              {mentionQuery && mentionCandidates.length > 0 && (
                <View style={styles.mentionDropdown} accessibilityRole="list">
                  {mentionSuggestions.length === 0 ? (
                    <Text style={styles.mentionEmptyText}>Nenhum participante encontrado.</Text>
                  ) : (
                    mentionSuggestions.map((candidate) => (
                      <Pressable
                        key={candidate.profileId}
                        onPress={() => selectMention(candidate)}
                        style={styles.mentionOption}
                        accessibilityRole="button"
                      >
                        <Text style={styles.mentionOptionText}>@{candidate.displayName}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
              <View style={styles.footer}>
                <TextInput
                  style={styles.input}
                  placeholder="Escreva uma mensagem... (@ para mencionar)"
                  placeholderTextColor={colors.tx50}
                  accessibilityLabel="Escrever uma resposta"
                  value={draft}
                  onChangeText={handleDraftChange}
                  onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                  editable={sendPhase !== 'sending'}
                />
                <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sendPhase === 'sending'}>
                  <SendIcon size={14} color={colors.off} />
                </Pressable>
              </View>
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
  replyQuote: {
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  replyQuoteAuthor: {
    color: colors.tx50,
    fontFamily: fonts.subBold,
    fontSize: 10.5,
  },
  replyQuoteText: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 10.5,
  },
  replyButtonText: {
    marginTop: 4,
    color: colors.tx30,
    fontFamily: fonts.subBold,
    fontSize: 10.5,
  },
  mention: {
    color: colors.off,
    fontFamily: fonts.subBold,
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
  loadMoreWrap: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
  },
  loadMoreText: {
    color: colors.red,
    fontFamily: fonts.subBold,
    fontSize: 12,
  },
  loadMoreErrorText: {
    color: '#ff8b80',
    fontFamily: fonts.body,
    fontSize: 11.5,
  },
  retryText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
    textDecorationLine: 'underline',
  },
  noRepliesText: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 11.5,
  },
  replyTargetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.red,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  replyTargetText: {
    flex: 1,
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  replyTargetAuthor: {
    color: colors.tx70,
    fontFamily: fonts.subBold,
  },
  cancelReplyText: {
    color: colors.tx30,
    fontFamily: fonts.subBold,
    fontSize: 13,
  },
  mentionDropdown: {
    marginHorizontal: 14,
    marginTop: 8,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.panelSolid,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  mentionEmptyText: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 11.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mentionOption: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mentionOptionText: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 12.5,
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
