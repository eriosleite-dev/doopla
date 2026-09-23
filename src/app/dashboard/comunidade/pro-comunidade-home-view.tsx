'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../pro-format';
import { ProAccordion, ProEmptyState } from '../pro-ui';
import { removeTopicAction, searchCommunityTopicsAction, type CommunityTopicCard } from './actions';
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
// Busca universal (16/09/2026, decisão canônica da fundadora) — a
// Comunidade não depende de categorias fixas/obrigatórias pra
// descoberta. search_community_topics (migration 0068) já faz
// full-text search real (título/corpo, categoria/tag só como boost
// opcional de ranking) — o filtro de categoria que existia aqui era só
// UI, nunca uma limitação do backend. Removido sem substituto (nenhum
// novo dropdown/chips fixos): busca ocupa o espaço, exemplos abaixo
// dela só ensinam que dá pra pesquisar livremente.
const SEARCH_EXAMPLES = ['equipamentos de som', 'quanto cobrar', 'fotógrafos', 'cliente cancelou'];

export function ProComunidadeHomeView({
  savedTopics,
  savedTopicIds,
  forYouTopics,
  trendingTopics,
  recentTopics,
  initialQuery,
  currentProfileId,
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
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CommunityTopicCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
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
    if (!trimmed) {
      router.replace(pathname, { scroll: false });
      return;
    }

    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      router.replace(`${pathname}?q=${encodeURIComponent(trimmed)}`, { scroll: false });
      setSearching(true);
      setSearchError(false);
      try {
        const cards = await searchCommunityTopicsAction(trimmed);
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
  }, [query]);

  const isSearchMode = query.trim().length > 0;

  const emptyResultMessage = `Nenhum resultado para "${query.trim()}". Tente outras palavras ou um jeito diferente de perguntar.`;

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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque qualquer assunto na Comunidade"
            className={`${proInputClass} @lg:flex-1`}
          />
          <div className="flex items-center gap-2">
            <CommunityNotificationsBell />
            <Link href="/dashboard/comunidade/novo" className={`${proPrimaryButtonClass} flex-1 whitespace-nowrap @lg:flex-none`}>
              Criar tópico
            </Link>
          </div>
        </div>

        {/* Exemplos discretos, nunca categorias/filtros permanentes — só
            ensinam que dá pra pesquisar livremente. Somem assim que uma
            busca real começa. Clicáveis por conveniência (preenchem a
            busca), não são chips de taxonomia. */}
        {!isSearchMode && (
          <p className="text-[12px] text-[var(--pro-tx-30)]">
            Experimente:{' '}
            {SEARCH_EXAMPLES.map((example, i) => (
              <span key={example}>
                <button type="button" onClick={() => setQuery(example)} className="underline decoration-dotted hover:text-[var(--pro-tx-50)]">
                  {example}
                </button>
                {i < SEARCH_EXAMPLES.length - 1 && ' · '}
              </span>
            ))}
          </p>
        )}
      </div>

      {isSearchMode ? (
        <TopicListSection
          title="Conversas relacionadas"
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
            // Achado real de QA (23/09/2026) — fundadora pediu explicitamente
            // pra reverter o "trilho horizontal compacto" (card pequeno
            // isolado, tentativas anteriores só encolheram o box vazio ao
            // redor dele): quer o mesmo padrão de linha cheia já usado por
            // "Para você"/"Em alta agora"/"Recentes" abaixo — reaproveita
            // TopicRowList diretamente, nunca um componente novo.
            <ProAccordion title="Suas comunidades" count={savedTopicsState.length} defaultOpen>
              <TopicRowList
                topics={savedTopicsState}
                savedTopicIds={savedTopicIds}
                currentProfileId={currentProfileId}
                onDeleted={handleTopicDeleted}
              />
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
        <div
          key={topic.id}
          className="flex items-start justify-between gap-3 rounded-[10px] px-2 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-white/[0.02]"
        >
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
