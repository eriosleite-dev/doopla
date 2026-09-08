import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ensureCommunityProfileActivated, getCommunityAuthors, getCommunityTopic, listCommunityCategories, listSavedTopicIds } from '@/lib/community/data';

import { getSessionProfile } from '../../session';
import { SaveTopicButton } from '../save-topic-button';
import { ProComunidadeTopicChat } from './pro-comunidade-topic-view';
import { COMMUNITY_POSTS_PAGE_SIZE, loadCommunityPostsPage, topicToTimelineMessage } from './timeline';

export async function generateMetadata(props: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: `Comunidade | Doopla` , description: topicId };
}

// Item 5 (08/09/2026) — o tópico só busca a PRIMEIRA página de
// respostas (as mais antigas, COMMUNITY_POSTS_PAGE_SIZE por vez — ver
// timeline.ts pro porquê da direção e do tamanho). Páginas seguintes
// ("carregar mais respostas") e a resposta recém-enviada são geridas
// inteiramente no client (ProComunidadeTopicChat), nunca mais
// recarregando este Server Component inteiro — daí createReplyAction
// não usar mais revalidatePath nesta rota (ver actions.ts): um
// revalidate reexecutaria este page.tsx do zero, devolvendo de novo só
// a primeira página, e apagaria qualquer página adicional que o
// client já tivesse carregado.
export default async function ComunidadeTopicPage(props: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await props.params;
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  await ensureCommunityProfileActivated(supabase);

  const topic = await getCommunityTopic(supabase, topicId);
  if (!topic) notFound();

  const [categories, savedTopicIds, topicAuthorsById, { messages: postMessages, hasMore }] = await Promise.all([
    listCommunityCategories(supabase),
    listSavedTopicIds(supabase),
    getCommunityAuthors(supabase, [topic.author_profile_id]),
    loadCommunityPostsPage(supabase, topicId, { limit: COMMUNITY_POSTS_PAGE_SIZE }),
  ]);

  const categoryLabel = categories.find((c) => c.id === topic.category_id)?.label ?? null;
  const isSaved = savedTopicIds.includes(topicId);

  const topicMessage = topicToTimelineMessage(topic, topicAuthorsById);
  const initialMessages = [topicMessage, ...postMessages];

  return (
    <main className="flex flex-col gap-4">
      <header className="border-b border-[var(--pro-line)] pb-4">
        <p className="font-doopla-mono text-[10px] uppercase tracking-[.08em] text-[var(--pro-tx-30)]">
          Comunidade{categoryLabel ? ` · ${categoryLabel}` : ''}
        </p>
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <h1 className="min-w-0 font-pro-sub text-[19px] font-bold leading-snug text-[var(--pro-off)]">{topic.title}</h1>
          <SaveTopicButton
            topicId={topic.id}
            initialSaved={isSaved}
            className="mt-0.5 flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]"
          />
        </div>
      </header>

      <ProComunidadeTopicChat
        topicId={topicId}
        initialMessages={initialMessages}
        initialHasMore={hasMore}
        currentProfileId={profile.id}
        topicRemoved={topicMessage.removed}
      />
    </main>
  );
}
