import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  listCommunityForYouTopics,
  listCommunityTopics,
  listCommunityTopicsByIds,
  listCommunityTrendingTopics,
  listSavedTopicIds,
} from '@/lib/community/data';

import { formatRelativeTime } from '../pro-format';
import { ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import type { CommunityTopicCard } from './actions';
import { ProComunidadeHomeView } from './pro-comunidade-home-view';

export const metadata: Metadata = {
  title: 'Comunidade | Doopla',
};

// Comunidade — Fase 1 da rodada search-first (06/09/2026). Primeira UI
// real do bloco (schema/RPCs já existiam desde a migration 0059, nunca
// conectados a nenhuma tela). V1 é artista-only (mesmo gate das RPCs).
export default async function ComunidadePage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  // Auditoria de performance (QA real, 16/09/2026) — achado real: esta
  // página fazia 4 round-trips SEQUENCIAIS pro Supabase antes do
  // primeiro render (ensureCommunityProfileActivated → lote de 4 em
  // paralelo → savedTopics por id → authors), cada um uma latência de
  // rede cheia. `ensureCommunityProfileActivated` nunca foi checado
  // como dependência real das leituras abaixo — auditoria de RLS/RPC
  // (nenhuma policy de community_topics/community_saved_topics/
  // get_community_for_you_topics/get_community_trending_topics
  // referencia community_profiles) + teste real num Postgres local
  // (todas as 4 leituras funcionam normalmente pra um profile que
  // NUNCA ativou a Comunidade) confirmam que é seguro disparar em
  // paralelo com o lote de leitura, não antes dele — só precisa ter
  // terminado antes de qualquer ESCRITA (criar tópico/post/salvar),
  // que já é uma chamada separada, feita nas actions, não aqui.
  const ensureActivatedPromise = ensureCommunityProfileActivated(supabase);

  // "Para você"/"Em alta agora" são realces opcionais (cold start já
  // devolve vazio de propósito, ver listCommunityForYouTopics/
  // listCommunityTrendingTopics) — uma falha pontual nessas 2 RPCs
  // (ranking, migration 0079) nunca pode derrubar a página inteira da
  // Comunidade (achado real, 16/09/2026: a página inteira quebrava sem
  // nenhum error.tsx pra capturar, sem status 5xx visível nos Runtime
  // Logs — reject de qualquer item do Promise.all rejeitava tudo).
  // Recentes/Salvos continuam fail-closed de verdade (essas sim
  // essenciais pra tela fazer sentido). Categorias não é mais buscada
  // aqui (busca universal, 16/09/2026) — nenhum consumidor restante
  // nesta página.
  const recentTopicsPromise = listCommunityTopics(supabase, { limit: 20 });
  const forYouTopicsPromise = listCommunityForYouTopics(supabase, 6).catch((err) => {
    console.error('[comunidade] get_community_for_you_topics falhou', err);
    return [];
  });
  const trendingTopicsPromise = listCommunityTrendingTopics(supabase, 6).catch((err) => {
    console.error('[comunidade] get_community_trending_topics falhou', err);
    return [];
  });

  // savedTopics precisa saber os ids salvos primeiro (dependência real,
  // não dá pra paralelizar essa parte) — mas assim que souber, dispara
  // na hora: fica em voo AO MESMO TEMPO que recentTopics/forYou/
  // trending acima, nunca depois deles. Antes, os 4 viviam no mesmo
  // Promise.all e savedTopics só começava depois que TODOS os 4
  // terminassem — um round-trip inteiro de espera adicional, sem
  // necessidade real (savedTopics não depende de recentTopics/forYou/
  // trending, só de savedTopicIds).
  const savedTopicIds = await listSavedTopicIds(supabase);
  const savedTopicIdSet = new Set(savedTopicIds);
  // Correção do item 2A (08/09/2026) — a versão anterior cortava em 20 e
  // linkava "Ver todos" pra /dashboard/comunidade/salvos, violando a
  // decisão de "Salvos por você" ser uma superfície 100% inline na Home.
  // Auditoria: nem listSavedTopicIds (sem .limit(), já traz todos os IDs
  // do usuário) nem listCommunityTopicsByIds (limit é só um parâmetro
  // opcional do caller) impõem restrição real de backend — o corte de 20
  // era só uma escolha de app, não do schema/RPC. Sem indício de volume
  // que justifique paginação pra uma lista pessoal de salvos, a solução
  // mínima correta é buscar TODOS e renderizar todos dentro do próprio
  // accordion — sem link de saída, sem "mostrar mais". A rota dedicada
  // /dashboard/comunidade/salvos continua existindo (compatibilidade),
  // só deixa de ser referenciada pela Home.
  const savedTopicsPromise = listCommunityTopicsByIds(supabase, savedTopicIds, savedTopicIds.length);

  const [recentTopics, forYouTopics, trendingTopics, savedTopics] = await Promise.all([
    recentTopicsPromise,
    forYouTopicsPromise,
    trendingTopicsPromise,
    savedTopicsPromise,
  ]);
  await ensureActivatedPromise;

  const authorsById = await getCommunityAuthors(supabase, [
    ...new Set([...recentTopics, ...savedTopics, ...forYouTopics, ...trendingTopics].map((t) => t.author_profile_id)),
  ]);

  function toCard(topic: (typeof recentTopics)[number]): CommunityTopicCard {
    return {
      id: topic.id,
      title: topic.title,
      authorProfileId: topic.author_profile_id,
      authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
      replyCount: topic.reply_count,
      timeLabel: formatRelativeTime(topic.last_activity_at),
      href: `/dashboard/comunidade/${topic.id}`,
    };
  }

  return (
    <main className="@container">
      <ProPageHeader
        title="Comunidade"
        subtitle="Busque assunto, profissão, dúvida ou interesse. A Doopla te ajuda a achar a conversa certa."
      />
      <ProComunidadeHomeView
        savedTopics={savedTopics.map((t) => ({ ...toCard(t), saved: true as const }))}
        savedTopicIds={savedTopicIdSet}
        forYouTopics={forYouTopics.map(toCard)}
        trendingTopics={trendingTopics.map(toCard)}
        recentTopics={recentTopics.map(toCard)}
        initialQuery={q ?? ''}
        currentProfileId={profile.id}
      />
    </main>
  );
}
