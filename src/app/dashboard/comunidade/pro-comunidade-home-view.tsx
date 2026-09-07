'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../pro-format';
import { ProCard, ProEmptyState } from '../pro-ui';
import { searchCommunityTopicsAction, type CommunityTopicCard } from './actions';
import { SaveTopicButton } from './save-topic-button';

// Comunidade — Fase 1 (06/09/2026). SEARCH-FIRST: a busca em linguagem
// natural é o mecanismo principal de descoberta, nunca chips de
// categoria/profissão fixos dominando a tela (decisão explícita do
// usuário — taxonomia fica por baixo, só usada dentro da busca pra
// ranking, nunca como grade de navegação obrigatória). Quando não há
// busca ativa: "Salvos por você" (preview) + "Recentes". Quando há
// busca: substitui tudo por resultado, sem seções. "Em alta"/"Para
// você" ficam pra Fase 2 (precisam de sinais de uso reais, não
// inventados agora).
export function ProComunidadeHomeView({
  savedPreview,
  savedTopicIds,
  recentTopics,
  savedCount,
}: {
  savedPreview: (CommunityTopicCard & { saved: true })[];
  savedTopicIds: Set<string>;
  recentTopics: CommunityTopicCard[];
  savedCount: number;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommunityTopicCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) return;

    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
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
  }, [query]);

  const isSearchMode = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque por assunto, profissão, dúvida ou interesse — ex: “como negociar cachê”"
          className={`${proInputClass} @lg:flex-1`}
        />
        <Link href="/dashboard/comunidade/novo" className={`${proPrimaryButtonClass} whitespace-nowrap`}>
          Criar tópico
        </Link>
      </div>

      {isSearchMode ? (
        <TopicResultsSection
          title="Resultado da busca"
          loading={searching}
          error={searchError}
          topics={results ?? []}
          savedTopicIds={savedTopicIds}
          emptyMessage={`Nenhum resultado para "${query.trim()}". Tente outras palavras ou um jeito diferente de perguntar.`}
        />
      ) : (
        <>
          {savedCount > 0 && (
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <p className="font-pro-sub text-[13.5px] font-bold">Salvos por você</p>
                {savedCount > savedPreview.length && (
                  <Link href="/dashboard/comunidade/salvos" className="text-[12px] font-bold text-[var(--pro-red)] hover:underline">
                    Ver todos ({savedCount}) →
                  </Link>
                )}
              </div>
              <TopicCardGrid topics={savedPreview} savedTopicIds={savedTopicIds} />
            </section>
          )}

          <section>
            <p className="mb-2.5 font-pro-sub text-[13.5px] font-bold">Recentes</p>
            {recentTopics.length === 0 ? (
              <ProEmptyState message="Nenhuma discussão por aqui ainda. Seja o primeiro a abrir um tópico." />
            ) : (
              <TopicCardGrid topics={recentTopics} savedTopicIds={savedTopicIds} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TopicResultsSection({
  title,
  loading,
  error,
  topics,
  savedTopicIds,
  emptyMessage,
}: {
  title: string;
  loading: boolean;
  error: boolean;
  topics: CommunityTopicCard[];
  savedTopicIds: Set<string>;
  emptyMessage: string;
}) {
  return (
    <section>
      <p className="mb-2.5 font-pro-sub text-[13.5px] font-bold">{title}</p>
      {loading ? (
        <p className="text-[12.5px] text-[var(--pro-tx-50)]">Buscando…</p>
      ) : error ? (
        <ProEmptyState message="Não deu pra buscar agora. Tente de novo em instantes." />
      ) : topics.length === 0 ? (
        <ProEmptyState message={emptyMessage} />
      ) : (
        <TopicCardGrid topics={topics} savedTopicIds={savedTopicIds} />
      )}
    </section>
  );
}

function TopicCardGrid({ topics, savedTopicIds }: { topics: CommunityTopicCard[]; savedTopicIds: Set<string> }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
      {topics.map((topic) => (
        <ProCard key={topic.id} className="!p-4">
          <div className="flex items-start justify-between gap-3">
            <Link href={topic.href} className="min-w-0 flex-1">
              <p className="font-pro-sub text-[13.5px] font-bold leading-snug">{topic.title}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--pro-tx-50)]">
                <span>{topic.authorName}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {topic.replyCount} {topic.replyCount === 1 ? 'resposta' : 'respostas'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{topic.timeLabel}</span>
              </p>
            </Link>
            <SaveTopicButton
              topicId={topic.id}
              initialSaved={savedTopicIds.has(topic.id)}
              className="flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]"
            />
          </div>
        </ProCard>
      ))}
    </div>
  );
}
