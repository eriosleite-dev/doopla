import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import {
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  getCommunityTopic,
  getTopicReadPosition,
  listCommunityCategories,
  listSavedTopicIds,
} from '@/lib/community/data';

import { getSessionProfile } from '../../session';
import { ProComunidadeTopicChat } from './pro-comunidade-topic-view';
import { COMMUNITY_POSTS_PAGE_SIZE, loadCommunityPostsPage, topicToTimelineMessage } from './timeline';
import { TopicHeader } from './topic-header';

export async function generateMetadata(props: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: `Comunidade | Doopla` , description: topicId };
}

// Correção do Item 5 (08/09/2026, arquitetura C aprovada após
// auditoria) — o tópico busca a página mais RECENTE de respostas
// (`loadCommunityPostsPage` sem cursor = as últimas COMMUNITY_POSTS_
// PAGE_SIZE — ver timeline.ts/data.ts pro porquê da direção e do
// tamanho). "Carregar mensagens anteriores" e a resposta recém-enviada
// são geridas inteiramente no client (ProComunidadeTopicChat), nunca
// recarregando este Server Component — daí createReplyAction não usar
// mais revalidatePath nesta rota (ver actions.ts): um revalidate
// reexecutaria este page.tsx do zero, devolvendo de novo só a página
// mais recente e apagaria qualquer página anterior que o client já
// tivesse carregado.
export default async function ComunidadeTopicPage(props: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await props.params;
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  await ensureCommunityProfileActivated(supabase);

  const topic = await getCommunityTopic(supabase, topicId);
  if (!topic) notFound();

  const [categories, savedTopicIds, topicAuthorsById, { messages: postMessages, hasMore }, initialReadPostId] = await Promise.all([
    listCommunityCategories(supabase),
    listSavedTopicIds(supabase),
    getCommunityAuthors(supabase, [topic.author_profile_id]),
    loadCommunityPostsPage(supabase, topicId, { limit: COMMUNITY_POSTS_PAGE_SIZE }),
    getTopicReadPosition(supabase, topicId),
  ]);

  const categoryLabel = categories.find((c) => c.id === topic.category_id)?.label ?? null;
  const isSaved = savedTopicIds.includes(topicId);

  const topicMessage = topicToTimelineMessage(topic, topicAuthorsById);
  const initialMessages = [topicMessage, ...postMessages];

  return (
    <main className="flex flex-col gap-4">
      <TopicHeader
        title={topic.title}
        categoryLabel={categoryLabel}
        topicId={topic.id}
        isSaved={isSaved}
        isAuthor={topic.author_profile_id === profile.id}
      />

      <ProComunidadeTopicChat
        topicId={topicId}
        initialMessages={initialMessages}
        initialHasMore={hasMore}
        currentProfileId={profile.id}
        topicRemoved={topicMessage.removed}
        initialReadPostId={initialReadPostId}
      />
    </main>
  );
}
