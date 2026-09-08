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
import { getSessionProfile } from '../../session';
import { SaveTopicButton } from '../save-topic-button';
import { ProComunidadeReplyForm } from './pro-comunidade-topic-view';

export async function generateMetadata(props: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: `Comunidade | Doopla` , description: topicId };
}

// Item 3 (08/09/2026) — o tópico deixa de ser "cabeçalho + cards
// empilhados" (um <ProCard> por mensagem, mesmo tratamento visual de
// card usado em listas) e vira uma única linha do tempo cronológica:
// a mensagem que abriu o tópico entra na MESMA lista/mesmo componente
// das respostas (TimelineMessage), só o cabeçalho acima (título +
// categoria + salvar) fica fora — ele descreve a conversa, não é uma
// mensagem dela. Nenhuma ordenação/fonte de dado muda: listCommunityPosts
// já ordena por created_at ascendente (migration 0059); aqui só
// combinamos topic+posts num array só, na mesma ordem que já existia
// (tópico sempre primeiro por ser sempre o created_at mais antigo).
type TimelineMessage = {
  id: string;
  authorName: string;
  timeLabel: string;
  body: string;
  removed: boolean;
  removedLabel: string;
};

function ChatMessage({ authorName, timeLabel, body, removed, removedLabel }: TimelineMessage) {
  return (
    <div className="py-3 first:pt-0">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-pro-sub text-[12.5px] font-bold text-[var(--pro-off)]">{authorName}</span>
        <span className="font-doopla-mono text-[10px] text-[var(--pro-tx-30)]">{timeLabel}</span>
      </p>
      {removed ? (
        <p className="mt-1 text-[12.5px] italic text-[var(--pro-tx-30)]">{removedLabel}</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--pro-tx-70)]">{body}</p>
      )}
    </div>
  );
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

  const timeline: TimelineMessage[] = [
    {
      id: topic.id,
      authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
      timeLabel: formatRelativeTime(topic.created_at),
      body: topic.body,
      removed: isRemoved,
      removedLabel: 'Este tópico foi removido.',
    },
    ...posts.map((post) => ({
      id: post.id,
      authorName: authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla',
      timeLabel: formatRelativeTime(post.created_at),
      body: post.body,
      removed: communityContentVisibility(post.status) === 'removed',
      removedLabel: 'Mensagem removida.',
    })),
  ];

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

      <div className="divide-y divide-[var(--pro-line)]">
        {timeline.map((message) => (
          <ChatMessage key={message.id} {...message} />
        ))}
      </div>

      {!isRemoved && posts.length === 0 && (
        <p className="text-[12px] text-[var(--pro-tx-30)]">Nenhuma resposta ainda. Seja o primeiro a responder.</p>
      )}

      {!isRemoved && <ProComunidadeReplyForm topicId={topicId} />}
    </main>
  );
}
