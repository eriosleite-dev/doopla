import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { ForumTopicRow } from '@/components/forum/ForumTopicRow';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { formatRelativeDate } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import {
  countUnreadCommunityNotifications,
  ensureCommunityProfileActivated,
  fetchCommunityAuthors,
  fetchCommunityCategories,
  fetchCommunityForYouTopics,
  fetchCommunityTopics,
  fetchCommunityTopicsByIds,
  fetchCommunityTrendingTopics,
  fetchSavedTopicIds,
  removeCommunityTopic,
  saveTopic,
  searchCommunityTopics,
  unsaveTopic,
  type CommunityAuthorSnapshot,
} from '@/lib/data/community';
import type { CommunityCategory, CommunityTopic } from '@/types/community';

type Phase = 'loading' | 'ready' | 'error';

// Preview de Salvos na Home do App (08/09/2026) — fecha o gap de
// paridade registrado no §74 do PROGRESS.md ("App vai direto pra tela
// dedicada em vez de preview na Home"). Diferente da Web (que decidiu
// NÃO ter "Ver todos" pra manter "Salvos por você" 100% inline —
// decisão própria da Web, registrada em pro-comunidade-home-view.tsx),
// o paradigma do App já é navegação por tela cheia (/forum/salvos já
// existe e continua existindo) — "Ver todos" aqui é nativo do
// paradigma, não uma regressão da decisão web. SAVED_PREVIEW_LIMIT é
// só o recorte do preview; a tela dedicada continua sem corte.
const SAVED_PREVIEW_LIMIT = 3;

// Comunidade — Fase 1 da rodada search-first (06/09/2026). Substitui
// completamente o Fórum mockado (forumMock.ts, deletado): busca real
// (search_community_topics, migration 0068) é o mecanismo principal
// de descoberta — os chips de categoria (agora vindos de
// community_categories, nunca mais hardcoded) são um filtro
// SECUNDÁRIO, nunca a navegação obrigatória. Mesma fonte/RPC/RLS que o
// painel web (src/app/dashboard/comunidade) — nenhuma arquitetura
// paralela.
export default function ForumTopicListScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [authorsById, setAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedPreview, setSavedPreview] = useState<CommunityTopic[]>([]);
  const [savedPreviewAuthorsById, setSavedPreviewAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  // Comunidade V2 — ranking V1 (migration 0079). Cold-start-safe: as
  // RPCs já devolvem [] quando não há sinal real (sem salvo/participação
  // pra "Para você", sem tópico acima do threshold pra "Em alta") — as
  // seções somem sozinhas, nunca uma caixa vazia grande.
  const [forYouTopics, setForYouTopics] = useState<CommunityTopic[]>([]);
  const [forYouAuthorsById, setForYouAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [trendingTopics, setTrendingTopics] = useState<CommunityTopic[]>([]);
  const [trendingAuthorsById, setTrendingAuthorsById] = useState<Map<string, CommunityAuthorSnapshot>>(new Map());
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [search, setSearch] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [deletingTopicIds, setDeletingTopicIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Categorias + salvos + ativação do perfil de Comunidade: uma vez só,
  // no mount — não depende de busca/categoria ativa.
  const loadBase = useCallback(async () => {
    try {
      await ensureCommunityProfileActivated();
      const [cats, saved, unreadCount, forYou, trending] = await Promise.all([
        fetchCommunityCategories(),
        fetchSavedTopicIds(),
        // Contagem exata (nunca derivada de fetchCommunityNotifications,
        // que hoje é só um preview das últimas 20 — correção 09/09/2026,
        // P1 "paginação/limite real na query de notificações").
        countUnreadCommunityNotifications(),
        fetchCommunityForYouTopics(6),
        fetchCommunityTrendingTopics(6),
      ]);
      setCategories(cats);
      setSavedIds(new Set(saved));
      setUnreadNotifications(unreadCount);
      setForYouTopics(forYou);
      setTrendingTopics(trending);

      const [forYouAuthors, trendingAuthors] = await Promise.all([
        fetchCommunityAuthors([...new Set(forYou.map((t) => t.author_profile_id))]),
        fetchCommunityAuthors([...new Set(trending.map((t) => t.author_profile_id))]),
      ]);
      setForYouAuthorsById(forYouAuthors);
      setTrendingAuthorsById(trendingAuthors);

      if (saved.length > 0) {
        const preview = await fetchCommunityTopicsByIds(saved, SAVED_PREVIEW_LIMIT);
        const previewAuthors = await fetchCommunityAuthors([...new Set(preview.map((t) => t.author_profile_id))]);
        setSavedPreview(preview);
        setSavedPreviewAuthorsById(previewAuthors);
      } else {
        setSavedPreview([]);
        setSavedPreviewAuthorsById(new Map());
      }
    } catch {
      // Falha aqui não impede a listagem principal (efeito abaixo) — só
      // deixa chips/estado de salvo/badge de notificação/preview de
      // salvos/Para você/Em alta temporariamente vazios.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadBase, 0);
    return () => clearTimeout(timer);
  }, [loadBase]);

  // Fonte ÚNICA da listagem principal — roda no mount (search='',
  // activeCategoryId=null) e de novo a cada busca/filtro de categoria.
  // Busca real no servidor (search_community_topics, migration 0068),
  // nunca filtro raso client-side sobre um array fixo como o mock antigo
  // fazia.
  useEffect(() => {
    const trimmed = search.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPhase('loading');
      try {
        const list = trimmed
          ? await searchCommunityTopics({ query: trimmed, categoryId: activeCategoryId, limit: 30 })
          : await fetchCommunityTopics({ categoryId: activeCategoryId ?? undefined, limit: 20 });
        const authors = await fetchCommunityAuthors([...new Set(list.map((t) => t.author_profile_id))]);
        setTopics(list);
        setAuthorsById(authors);
        setPhase('ready');
      } catch {
        setPhase('error');
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, activeCategoryId, retryTick]);

  // Item 6 (08/09/2026, correção do ••• ausente nos cards) — mesmo
  // padrão já usado em forum/[topicId].tsx: Alert.alert nativo faz
  // menu+confirmação num só passo (única opção é "Excluir"), removeCommunityTopic
  // já existente (mesma RPC do painel web), sucesso tira o card da lista
  // local sem precisar recarregar a tela inteira.
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
              setSavedPreview((prev) => prev.filter((t) => t.id !== topicId));
              setForYouTopics((prev) => prev.filter((t) => t.id !== topicId));
              setTrendingTopics((prev) => prev.filter((t) => t.id !== topicId));
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

  function toggleSave(topicId: string) {
    const wasSaved = savedIds.has(topicId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
    // Só remove do preview otimisticamente (unsave) — adicionar um
    // salvo novo ao preview exigiria rebuscar a lista pra saber a
    // posição/ordem certa; fica pro próximo mount (loadBase), mesmo
    // gap aceito em outras partes da Comunidade sem realtime.
    if (wasSaved) setSavedPreview((prev) => prev.filter((t) => t.id !== topicId));
    const action = wasSaved ? unsaveTopic(topicId) : saveTopic(topicId, professionalId ?? '');
    action.catch(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(topicId);
        else next.delete(topicId);
        return next;
      });
    });
  }

  // "Suas comunidades"/"Para você"/"Em alta agora" só existem na
  // navegação neutra (sem busca/filtro de categoria ativos) — mesma
  // regra da Web (pro-comunidade-home-view.tsx): busca substitui tudo
  // por resultado, sem seções de descoberta por baixo. Deduplicação de
  // apresentação (regra 17 da rodada): um tópico que já ocupou um slot
  // em "Suas comunidades" não repete em "Para você"/"Em alta", e um que
  // já apareceu em qualquer um dos dois anteriores não repete na
  // listagem principal (Recentes) — nunca mexe nos datasets canônicos,
  // só filtra a apresentação na ordem de prioridade da hierarquia.
  const isDefaultBrowse = search.trim().length === 0 && activeCategoryId === null;
  const { dedupedForYou, dedupedTrending, dedupedTopics } = useMemo(() => {
    if (!isDefaultBrowse) return { dedupedForYou: [], dedupedTrending: [], dedupedTopics: topics };
    const used = new Set(savedPreview.map((t) => t.id));
    const forYou = forYouTopics.filter((t) => !used.has(t.id));
    forYou.forEach((t) => used.add(t.id));
    const trending = trendingTopics.filter((t) => !used.has(t.id));
    trending.forEach((t) => used.add(t.id));
    const mainList = topics.filter((t) => !used.has(t.id));
    return { dedupedForYou: forYou, dedupedTrending: trending, dedupedTopics: mainList };
  }, [isDefaultBrowse, savedPreview, forYouTopics, trendingTopics, topics]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Fórum" onClose={() => router.dismissAll()} />
      <View style={styles.body}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Busque por assunto, profissão ou dúvida…"
            placeholderTextColor={colors.tx50}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/forum/salvos')}>
            <Text style={styles.actionText}>Salvos</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/forum/notificacoes')}>
            <Text style={styles.actionText}>Notificações</Text>
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={() => router.push('/forum/novo')}>
            <Text style={[styles.actionText, styles.actionPrimaryText]}>Criar tópico</Text>
          </Pressable>
        </View>

        {savedPreview.length > 0 && (
          <View style={styles.savedPreviewSection}>
            <View style={styles.savedPreviewHeader}>
              <Text style={styles.sectionTitle}>Suas comunidades</Text>
              {savedIds.size > savedPreview.length && (
                <Pressable onPress={() => router.push('/forum/salvos')}>
                  <Text style={styles.savedPreviewSeeAll}>Ver todos</Text>
                </Pressable>
              )}
            </View>
            {savedPreview.map((topic, i) => (
              <ForumTopicRow
                key={topic.id}
                title={topic.title}
                meta={`${savedPreviewAuthorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · ${topic.reply_count} ${
                  topic.reply_count === 1 ? 'resposta' : 'respostas'
                }`}
                lastActivity={formatRelativeDate(topic.last_activity_at)}
                saved
                onToggleSave={() => toggleSave(topic.id)}
                bordered={i > 0}
                onPress={() => router.push(`/forum/${topic.id}`)}
              />
            ))}
          </View>
        )}

        {isDefaultBrowse && dedupedForYou.length > 0 && (
          <View style={styles.savedPreviewSection}>
            <Text style={styles.sectionTitle}>Para você</Text>
            {dedupedForYou.map((topic, i) => (
              <ForumTopicRow
                key={topic.id}
                title={topic.title}
                meta={`${forYouAuthorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · ${topic.reply_count} ${
                  topic.reply_count === 1 ? 'resposta' : 'respostas'
                }`}
                lastActivity={formatRelativeDate(topic.last_activity_at)}
                saved={savedIds.has(topic.id)}
                onToggleSave={() => toggleSave(topic.id)}
                bordered={i > 0}
                onPress={() => router.push(`/forum/${topic.id}`)}
              />
            ))}
          </View>
        )}

        {isDefaultBrowse && dedupedTrending.length > 0 && (
          <View style={styles.savedPreviewSection}>
            <Text style={styles.sectionTitle}>Em alta agora</Text>
            {dedupedTrending.map((topic, i) => (
              <ForumTopicRow
                key={topic.id}
                title={topic.title}
                meta={`${trendingAuthorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · ${topic.reply_count} ${
                  topic.reply_count === 1 ? 'resposta' : 'respostas'
                }`}
                lastActivity={formatRelativeDate(topic.last_activity_at)}
                saved={savedIds.has(topic.id)}
                onToggleSave={() => toggleSave(topic.id)}
                bordered={i > 0}
                onPress={() => router.push(`/forum/${topic.id}`)}
              />
            ))}
          </View>
        )}

        {categories.length > 0 && (
          <View style={styles.chips}>
            <Pressable onPress={() => setActiveCategoryId(null)} style={[styles.chip, activeCategoryId === null && styles.chipActive]}>
              <Text style={[styles.chipText, activeCategoryId === null && styles.chipTextActive]}>Todos</Text>
            </Pressable>
            {categories.map((cat) => {
              const active = cat.id === activeCategoryId;
              return (
                <Pressable key={cat.id} onPress={() => setActiveCategoryId(cat.id)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {isDefaultBrowse && dedupedTopics.length > 0 && <Text style={styles.sectionTitle}>Recentes</Text>}

        {phase === 'loading' && <LoadingState label="Carregando tópicos…" />}
        {phase === 'error' && <ErrorState message="Não deu pra carregar o Fórum agora." onRetry={() => setRetryTick((t) => t + 1)} />}
        {/* topics.length (dataset canônico), nunca dedupedTopics.length —
           um tópico deduplicado (já mostrado em Para você/Em alta) não
           significa Comunidade vazia, só que Recentes não precisa
           repeti-lo (regra 17 da rodada). */}
        {phase === 'ready' && topics.length === 0 && (
          <EmptyState
            title="Nenhum tópico encontrado"
            subtitle={search.trim() ? 'Tente outras palavras ou um jeito diferente de perguntar.' : 'Seja o primeiro a abrir um tópico.'}
          />
        )}
        {phase === 'ready' &&
          dedupedTopics.map((topic, i) => (
            <ForumTopicRow
              key={topic.id}
              title={topic.title}
              meta={`${authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · ${topic.reply_count} ${
                topic.reply_count === 1 ? 'resposta' : 'respostas'
              }`}
              lastActivity={formatRelativeDate(topic.last_activity_at)}
              saved={savedIds.has(topic.id)}
              onToggleSave={() => toggleSave(topic.id)}
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
  searchRow: {
    marginBottom: 10,
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
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: colors.off,
    fontFamily: fonts.monoBold,
    fontSize: 9,
  },
  actionPrimary: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  actionText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 11.5,
  },
  actionPrimaryText: {
    color: colors.off,
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
  savedPreviewSection: {
    marginBottom: 16,
  },
  savedPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
  },
  savedPreviewSeeAll: {
    color: colors.tx50,
    fontFamily: fonts.subSemiBold,
    fontSize: 11.5,
  },
});
