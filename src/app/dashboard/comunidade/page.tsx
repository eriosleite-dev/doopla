import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  listCommunityTopics,
  listCommunityTopicsByIds,
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

  await ensureCommunityProfileActivated(supabase);

  const [recentTopics, savedTopicIds] = await Promise.all([listCommunityTopics(supabase, { limit: 20 }), listSavedTopicIds(supabase)]);
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
  const savedTopics = await listCommunityTopicsByIds(supabase, savedTopicIds, savedTopicIds.length);

  const authorsById = await getCommunityAuthors(supabase, [
    ...new Set([...recentTopics, ...savedTopics].map((t) => t.author_profile_id)),
  ]);

  function toCard(topic: (typeof recentTopics)[number]): CommunityTopicCard {
    return {
      id: topic.id,
      title: topic.title,
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
        recentTopics={recentTopics.map(toCard)}
        initialQuery={q ?? ''}
      />
    </main>
  );
}
