import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import {
  communityContentVisibility,
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  getCommunityTopic,
  listCommunityCategories,
  listCommunityPosts,
  listSavedTopicIds,
} from '@/lib/community/data';

import { formatRelativeTime } from '../../pro-format';
import { ProCard, ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { SaveTopicButton } from '../save-topic-button';
import { ProComunidadeReplyForm } from './pro-comunidade-topic-view';

export async function generateMetadata(props: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: `Comunidade | Doopla` , description: topicId };
}

export default async function ComunidadeTopicPage(props: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await props.params;
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  await ensureCommunityProfileActivated(supabase);

  const topic = await getCommunityTopic(supabase, topicId);
  if (!topic) notFound();

  const [posts, categories, savedTopicIds] = await Promise.all([
    listCommunityPosts(supabase, topicId),
    listCommunityCategories(supabase),
    listSavedTopicIds(supabase),
  ]);

  const authorsById = await getCommunityAuthors(supabase, [
    topic.author_profile_id,
    ...posts.map((p) => p.author_profile_id),
  ]);
  const categoryLabel = categories.find((c) => c.id === topic.category_id)?.label ?? null;
  const isSaved = savedTopicIds.includes(topicId);
  const isRemoved = communityContentVisibility(topic.status) === 'removed';

  return (
    <main>
      <ProPageHeader title="Comunidade" subtitle={categoryLabel ?? undefined} />

      <ProCard className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-pro-display text-xl font-semibold leading-snug text-[var(--pro-off)]">{topic.title}</h1>
            <p className="mt-1.5 text-[11.5px] text-[var(--pro-tx-50)]">
              {authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'} · {formatRelativeTime(topic.created_at)}
            </p>
          </div>
          <SaveTopicButton topicId={topic.id} initialSaved={isSaved} className="flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]" />
        </div>
        {isRemoved ? (
          <p className="mt-3 text-[12.5px] italic text-[var(--pro-tx-30)]">Este tópico foi removido.</p>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--pro-tx-70)]">{topic.body}</p>
        )}
      </ProCard>

      <div className="mb-4 flex flex-col gap-2.5">
        {posts.map((post) => {
          const removed = communityContentVisibility(post.status) === 'removed';
          return (
            <ProCard key={post.id} className="!p-4">
              <p className="text-[11.5px] text-[var(--pro-tx-50)]">
                {authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla'} · {formatRelativeTime(post.created_at)}
              </p>
              {removed ? (
                <p className="mt-1.5 text-[12.5px] italic text-[var(--pro-tx-30)]">Mensagem removida.</p>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--pro-off)]">{post.body}</p>
              )}
            </ProCard>
          );
        })}
      </div>

      {!isRemoved && <ProComunidadeReplyForm topicId={topicId} />}
    </main>
  );
}
