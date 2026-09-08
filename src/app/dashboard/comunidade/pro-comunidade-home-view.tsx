'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../pro-format';
import { ProAccordion, ProCard, ProEmptyState } from '../pro-ui';
import { removeTopicAction, searchCommunityTopicsAction, type CommunityTopicCard } from './actions';
import { DeleteMenu } from './[topicId]/delete-menu';
import { SaveTopicButton } from './save-topic-button';

// Comunidade — Fase 1 (06/09/2026). SEARCH-FIRST: a busca em linguagem
// natural é o mecanismo principal de descoberta, nunca chips de
// categoria/profissão fixos dominando a tela (decisão explícita do
// usuário — taxonomia fica por baixo, só usada dentro da busca pra
// ranking, nunca como grade de navegação obrigatória). Quando não há
// busca ativa: "Salvos por você" (accordion, item 2A/08-09-2026) +
// "Recentes". Quando há busca: substitui tudo por resultado, sem
// seções. "Em alta" fica pra Fase B (sinais reais de atividade, não
// inventados agora). "Recentes" aqui AINDA é o feed global por
// last_activity_at (mesmo de sempre) — não é histórico pessoal; isso
// só chega no item 9 da Fase B, quando existir infraestrutura real de
// acesso/visualização por profissional. Nunca fingir essa semântica
// antes de existir de verdade.
export function ProComunidadeHomeView({
  savedTopics,
  savedTopicIds,
  recentTopics,
  initialQuery,
  currentProfileId,
}: {
  savedTopics: (CommunityTopicCard & { saved: true })[];
  savedTopicIds: Set<string>;
  recentTopics: CommunityTopicCard[];
  // Preservação de contexto (07/09/2026, item 1 da correção de
  // navegação) — a busca digitada agora mora na URL (?q=), não só em
  // estado de componente: sobrevive a abrir um tópico e voltar (o
  // slide-over nunca desmonta esta rota por acidente, mas também não
  // dependemos mais disso — refresh/deep link com ?q= também já chega
  // com a busca certa).
  initialQuery: string;
  // Item 6 (08/09/2026, correção do ••• ausente nos cards) — decide,
  // por card, se mostra o menu de exclusão (comparando profile_id, nunca
  // nome). Segurança continua 100% do lado da RPC (remove_community_topic
  // já rejeita quem não é o autor) — isso aqui é só visibilidade de UI.
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

  // Item 6 — savedTopics/recentTopics viram estado local (seedado uma
  // vez a partir das props do Server Component) só pra permitir remover
  // um card otimisticamente depois de excluir, sem reload e sem
  // revalidar a rota inteira. Um tópico pode aparecer em mais de uma
  // lista ao mesmo tempo (salvo E recente, ou salvo E num resultado de
  // busca) — handleTopicDeleted remove de TODAS pra nunca sobrar um
  // card fantasma.
  const [savedTopicsState, setSavedTopicsState] = useState(savedTopics);
  const [recentTopicsState, setRecentTopicsState] = useState(recentTopics);

  function handleTopicDeleted(topicId: string) {
    setSavedTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setRecentTopicsState((prev) => prev.filter((t) => t.id !== topicId));
    setResults((prev) => (prev ? prev.filter((t) => t.id !== topicId) : prev));
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      // Limpa ?q= da URL imediatamente (sem debounce) — não é uma busca
      // em andamento, é o usuário tendo apagado o campo.
      router.replace(pathname, { scroll: false });
      return;
    }

    const myRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      // URL só é atualizada quando a busca de fato dispara (mesmo
      // debounce de 300ms) — evita empilhar/trocar a URL a cada tecla.
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
          currentProfileId={currentProfileId}
          onDeleted={handleTopicDeleted}
          emptyMessage={`Nenhum resultado para "${query.trim()}". Tente outras palavras ou um jeito diferente de perguntar.`}
        />
      ) : (
        <>
          {/* Item 2A (08/09/2026) — accordion inline, fechado por
             padrão (nenhum estado atual justifica abrir sozinho).
             Mesma fonte real de sempre (savedTopics/savedTopicIds,
             lidos de community_saved_topics via listCommunityTopicsByIds/
             listSavedTopicIds em page.tsx) — nenhuma query nova, só o
             container visual muda de <section> pra ProAccordion. Clicar
             num tópico salvo usa o mesmo <Link href={topic.href}>
             de sempre (dentro de TopicCardGrid), interceptado pela
             mesma navegação do item 1 — nenhuma rota/lógica paralela.
             Correção 08/09/2026 — removido o link "Ver todos" pra
             /dashboard/comunidade/salvos: a decisão aprovada exige que
             "Salvos por você" seja 100% inline na Home, sem precisar
             sair pra outra superfície. page.tsx agora busca TODOS os
             salvos (sem corte de 20) — auditoria confirmou que nem
             listSavedTopicIds nem listCommunityTopicsByIds impõem
             restrição real de backend, o corte era só do app. */}
          <ProAccordion title="Salvos por você" count={savedTopicsState.length}>
            {savedTopicsState.length === 0 ? (
              <ProEmptyState message="Você ainda não salvou nenhum tópico. Toque no marcador em qualquer tópico da Comunidade pra guardá-lo aqui." />
            ) : (
              <TopicCardGrid
                topics={savedTopicsState}
                savedTopicIds={savedTopicIds}
                currentProfileId={currentProfileId}
                onDeleted={handleTopicDeleted}
              />
            )}
          </ProAccordion>

          <section>
            <p className="mb-2.5 font-pro-sub text-[13.5px] font-bold">Recentes</p>
            {recentTopicsState.length === 0 ? (
              <ProEmptyState message="Nenhuma discussão por aqui ainda. Seja o primeiro a abrir um tópico." />
            ) : (
              <TopicCardGrid
                topics={recentTopicsState}
                savedTopicIds={savedTopicIds}
                currentProfileId={currentProfileId}
                onDeleted={handleTopicDeleted}
              />
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
  currentProfileId,
  onDeleted,
  emptyMessage,
}: {
  title: string;
  loading: boolean;
  error: boolean;
  topics: CommunityTopicCard[];
  savedTopicIds: Set<string>;
  currentProfileId: string;
  onDeleted: (topicId: string) => void;
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
        <TopicCardGrid topics={topics} savedTopicIds={savedTopicIds} currentProfileId={currentProfileId} onDeleted={onDeleted} />
      )}
    </section>
  );
}

function TopicCardGrid({
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
        </ProCard>
      ))}
    </div>
  );
}
