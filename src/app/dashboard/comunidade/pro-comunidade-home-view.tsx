'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { CommunityCategory } from '@/lib/supabase/types';

import { proInputClass, proPrimaryButtonClass } from '../pro-format';
import { ProAccordion, ProEmptyState } from '../pro-ui';
import { removeTopicAction, searchCommunityTopicsAction, type CommunityNotificationCard, type CommunityTopicCard } from './actions';
import { CommunityNotificationsBell } from './community-notifications-bell';
import { DeleteMenu } from './[topicId]/delete-menu';
import { SaveTopicButton } from './save-topic-button';

// Comunidade V2 — lapidação visual + descoberta + ranking V1
// (08/09/2026). Hierarquia da Home (busca → Suas comunidades → Para
// você → Em alta agora → Recentes) é conceitual, não uma obrigação de
// cinco caixas grandes iguais — cada camada tem uma função diferente
// (ver DECISOES.md) e ganha o tratamento visual que a função pede:
// "Suas comunidades" é intenção explícita (fixação rápida, trilho
// horizontal compacto); "Para você"/"Em alta"/"Recentes" são listas
// densas de linhas (TopicRow), nunca mosaico de cards — sofisticação
// vem de tipografia/spacing/hierarquia, não de caixa dentro de caixa.
// Busca continua o mecanismo PRINCIPAL de descoberta; o ranking ajuda,
// nunca domina (uma seção sem conteúdo útil simplesmente não aparece —
// nunca uma caixa vazia grande fingindo atividade que não existe).
export function ProComunidadeHomeView({
  savedTopics,
  savedTopicIds,
  forYouTopics,
  trendingTopics,
  recentTopics,
  initialQuery,
  currentProfileId,
  notifications,
  notificationsUnreadCount,
  categories,
}: {
  savedTopics: (CommunityTopicCard & { saved: true })[];
  savedTopicIds: Set<string>;
  // Cold-start-safe: já chega vazio quando não há sinal real (a
  // function SQL devolve [] de propósito — ver migration 0079). A
  // seção some sozinha nesse caso, nunca finge personalização.
  forYouTopics: CommunityTopicCard[];
  // Cold-start-safe: comunidade pequena sem tópico acima do threshold
  // de "Em alta" também chega vazia — mesma regra.
  trendingTopics: CommunityTopicCard[];
  recentTopics: CommunityTopicCard[];
  initialQuery: string;
  currentProfileId: string;
  // notifications é só um preview (últimas 20, ver
  // COMMUNITY_NOTIFICATIONS_PREVIEW_LIMIT em src/lib/community/data.ts,
  // correção 09/09/2026) — notificationsUnreadCount vem de uma
  // contagem exata separada, nunca derivada dessa lista limitada.
  notifications: CommunityNotificationCard[];
  notificationsUnreadCount: number;
  categories: CommunityCategory[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CommunityTopicCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const [savedTopicsState, setSavedTopicsState] = useState(savedTopics);
  const [forYouTopicsState, setForYouTopicsState] = useState(forYouTopics);
  const [trendingTopicsState, setTrendingTopicsState] = useState(trendingTopics);
  const [recentTopicsState, setRecentTopicsState] = useState(recentTopics);

  function handleTopicDeleted(topicId: string) {
    setSavedTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setForYouTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setTrendingTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setRecentTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setResults((prev) => (prev ? prev.filter((t) => t.id !== topicId) : prev));
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed && !categoryId) {
      router.replace(pathname, { scroll: false });
      return;
    }

    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      if (trimmed) router.replace(`${pathname}?q=${encodeURIComponent(trimmed)}`, { scroll: false });
      setSearching(true);
      setSearchError(false);
      try {
        const cards = await searchCommunityTopicsAction(trimmed, categoryId);
        if (requestIdRef.current === myRequestId) setResults(cards);
      } catch {
        if (requestIdRef.current === myRequestId) setSearchError(true);
      } finally {
        if (requestIdRef.current === myRequestId) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId]);

  const isSearchMode = query.trim().length > 0 || categoryId !== null;

  const activeCategoryLabel = categoryId ? categories.find((c) => c.id === categoryId)?.label : undefined;
  const emptyResultMessage = query.trim()
    ? `Nenhum resultado para "${query.trim()}"${activeCategoryLabel ? ` em ${activeCategoryLabel}` : ''}. Tente outras palavras ou um jeito diferente de perguntar.`
    : `Nenhum tópico em ${activeCategoryLabel ?? 'categoria'} ainda.`;

  // Deduplicação de apresentação (regra 17 da rodada) — um tópico que
  // já ocupou um slot em "Suas comunidades" não repete em "Para você"/
  // "Em alta", e um que já apareceu em qualquer um dos dois anteriores
  // não repete em "Recentes". Nunca mexe nos datasets canônicos (cada
  // seção continua vindo da sua própria fonte/ranking, com sua própria
  // ordem) — é só um filtro de apresentação aplicado na ordem de
  // prioridade da hierarquia da Home.
  const { dedupedForYou, dedupedTrending, dedupedRecent } = useMemo(() => {
    const used = new Set(savedTopicsState.map((t) => t.id));
    const forYou = forYouTopicsState.filter((t) => !used.has(t.id));
    forYou.forEach((t) => used.add(t.id));
    const trending = trendingTopicsState.filter((t) => !used.has(t.id));
    trending.forEach((t) => used.add(t.id));
    const recent = recentTopicsState.filter((t) => !used.has(t.id));
    return { dedupedForYou: forYou, dedupedTrending: trending, dedupedRecent: recent };
  }, [savedTopicsState, forYouTopicsState, trendingTopicsState, recentTopicsState]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque por assunto, profissão, dúvida ou interesse — ex: “como negociar cachê”"
          className={`${proInputClass} @lg:flex-1`}
        />
        {categories.length > 0 && (
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            aria-label="Filtrar por categoria"
            className={`${proInputClass} @lg:w-[180px] @lg:flex-none`}
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <CommunityNotificationsBell initialNotifications={notifications} initialUnreadCount={notificationsUnreadCount} />
          <Link href="/dashboard/comunidade/novo" className={`${proPrimaryButtonClass} flex-1 whitespace-nowrap @lg:flex-none`}>
            Criar tópico
          </Link>
        </div>
      </div>

      {isSearchMode ? (
        <TopicListSection
          title="Resultado da busca"
          loading={searching}
          error={searchError}
          topics={results ?? []}
          savedTopicIds={savedTopicIds}
          currentProfileId={currentProfileId}
          onDeleted={handleTopicDeleted}
          emptyMessage={emptyResultMessage}
        />
      ) : (
        <>
          {savedTopicsState.length > 0 && (
            <ProAccordion title="Suas comunidades" count={savedTopicsState.length} defaultOpen>
              <TopicRail topics={savedTopicsState} />
            </ProAccordion>
          )}

          {dedupedForYou.length > 0 && (
            <TopicListSection
              title="Para você"
              topics={dedupedForYou}
              savedTopicIds={savedTopicIds}
              currentProfileId={currentProfileId}
              onDeleted={handleTopicDeleted}
            />
          )}

          {dedupedTrending.length > 0 && (
            <TopicListSection
              title="Em alta agora"
              topics={dedupedTrending}
              savedTopicIds={savedTopicIds}
              currentProfileId={currentProfileId}
              onDeleted={handleTopicDeleted}
            />
          )}

          <TopicListSection
            title="Recentes"
            topics={dedupedRecent}
            savedTopicIds={savedTopicIds}
            currentProfileId={currentProfileId}
            onDeleted={handleTopicDeleted}
            emptyMessage="Nenhuma discussão por aqui ainda. Seja o primeiro a abrir um tópico."
          />
        </>
      )}
    </div>
  );
}

// Trilho horizontal compacto — "Suas comunidades" é acesso rápido ao
// que a pessoa decidiu acompanhar, nunca um grid de cards grandes
// competindo com o resto da Home (regra 6 da rodada).
function TopicRail({ topics }: { topics: CommunityTopicCard[] }) {
  return (
    <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
      {topics.map((topic) => (
        <Link
          key={topic.id}
          href={topic.href}
          className="flex-none rounded-[12px] border border-[var(--pro-line)] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-[var(--pro-tx-30)]"
          style={{ maxWidth: 220 }}
        >
          <p className="line-clamp-2 font-pro-sub text-[12.5px] font-bold leading-snug">{topic.title}</p>
          <p className="mt-1.5 text-[11px] text-[var(--pro-tx-30)]">
            {topic.replyCount} {topic.replyCount === 1 ? 'resposta' : 'respostas'} · {topic.timeLabel}
          </p>
        </Link>
      ))}
    </div>
  );
}

function TopicListSection({
  title,
  loading,
  error,
  topics,
  savedTopicIds,
  currentProfileId,
  onDeleted,
  emptyMessage,
}: {
  title: string;
  loading?: boolean;
  error?: boolean;
  topics: CommunityTopicCard[];
  savedTopicIds: Set<string>;
  currentProfileId: string;
  onDeleted: (topicId: string) => void;
  // Sem emptyMessage = a seção inteira não renderiza quando vazia
  // (chamador já decide isso via `{cond && <TopicListSection .../>}`,
  // exceto Recentes, que sempre mostra e por isso sempre passa uma).
  emptyMessage?: string;
}) {
  return (
    <section>
      <p className="mb-2.5 font-pro-sub text-[13.5px] font-bold">{title}</p>
      {loading ? (
        <p className="text-[12.5px] text-[var(--pro-tx-50)]">Buscando…</p>
      ) : error ? (
        <ProEmptyState message="Não deu pra buscar agora. Tente de novo em instantes." />
      ) : topics.length === 0 ? (
        emptyMessage && <ProEmptyState message={emptyMessage} />
      ) : (
        <TopicRowList topics={topics} savedTopicIds={savedTopicIds} currentProfileId={currentProfileId} onDeleted={onDeleted} />
      )}
    </section>
  );
}

// Linha densa — o essencial pra decidir se vale abrir (título, autor,
// atividade), metadado sempre discreto e nunca competindo com o
// título (regra 19/20 da rodada). Substitui o grid de cards anterior:
// menos borda/caixa, mais tipografia fazendo o trabalho de hierarquia.
function TopicRowList({
  topics,
  savedTopicIds,
  currentProfileId,
  onDeleted,
}: {
  topics: CommunityTopicCard[];
  savedTopicIds: Set<string>;
  currentProfileId: string;
  onDeleted: (topicId: string) => void;
}) {
  return (
    <div className="divide-y divide-[var(--pro-line)]">
      {topics.map((topic) => (
        <div key={topic.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <Link href={topic.href} className="min-w-0 flex-1">
            <p className="font-pro-sub text-[13.5px] font-bold leading-snug">{topic.title}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--pro-tx-30)]">
              <span>{topic.authorName}</span>
              <span aria-hidden="true">·</span>
              <span>
                {topic.replyCount} {topic.replyCount === 1 ? 'resposta' : 'respostas'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{topic.timeLabel}</span>
            </p>
          </Link>
          <div className="flex flex-none items-center gap-1">
            <SaveTopicButton
              topicId={topic.id}
              initialSaved={savedTopicIds.has(topic.id)}
              className="flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]"
            />
            {topic.authorProfileId === currentProfileId && (
              <DeleteMenu
                itemLabel="tópico"
                onDelete={async () => {
                  const result = await removeTopicAction(topic.id);
                  if ('error' in result) throw new Error(result.error);
                  onDeleted(topic.id);
                }}
                triggerClassName="flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
