import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import {
  communityContentVisibility,
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  getCommunityTopic,
  listCommunityCategories,
  listCommunityMentions,
  listCommunityPosts,
  listSavedTopicIds,
} from '@/lib/community/data';

import { formatRelativeTime } from '../../pro-format';
import { getSessionProfile } from '../../session';
import { SaveTopicButton } from '../save-topic-button';
import { ProComunidadeTopicChat, type ChatTimelineMessage, type MentionCandidate } from './pro-comunidade-topic-view';

export async function generateMetadata(props: { params: Promise<{ topicId: string }> }): Promise<Metadata> {
  const { topicId } = await props.params;
  return { title: `Comunidade | Doopla` , description: topicId };
}

function snippetOf(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
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

  // Item 4 (08/09/2026) — reply-to/mentions usam o vínculo real já
  // existente na migration 0059: community_posts.reply_to_post_id
  // (referência estruturada a OUTRO post, nunca ao tópico em si — não
  // há coluna equivalente pra "responder à mensagem de abertura", por
  // isso "Responder" só aparece nas respostas, nunca na mensagem
  // inicial; uma resposta solta sem alvo já é a semântica de sempre,
  // sem nenhuma mudança) e community_mentions (post_id -> profile_id,
  // estruturada, nunca parsing de "@nome" no texto). Nenhuma
  // tabela/RPC nova — só a leitura que faltava (listCommunityMentions)
  // e o wiring que a UI nunca fazia.
  const mentions = await listCommunityMentions(supabase, posts.map((p) => p.id));
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const mentionsByPost = new Map<string, string[]>();
  for (const mention of mentions) {
    const name = authorsById.get(mention.mentioned_profile_id)?.displayName;
    if (!name) continue;
    mentionsByPost.set(mention.post_id, [...(mentionsByPost.get(mention.post_id) ?? []), name]);
  }

  function resolveReplyTo(post: (typeof posts)[number]): ChatTimelineMessage['replyTo'] {
    if (!post.reply_to_post_id) return null;
    const target = postsById.get(post.reply_to_post_id);
    if (!target) return null;
    const removed = communityContentVisibility(target.status) === 'removed';
    return {
      postId: target.id,
      authorName: authorsById.get(target.author_profile_id)?.displayName ?? 'Profissional Doopla',
      snippet: removed ? '' : snippetOf(target.body),
      removed,
    };
  }

  const categoryLabel = categories.find((c) => c.id === topic.category_id)?.label ?? null;
  const isSaved = savedTopicIds.includes(topicId);
  const isRemoved = communityContentVisibility(topic.status) === 'removed';

  const timeline: ChatTimelineMessage[] = [
    {
      id: topic.id,
      postId: null,
      authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
      timeLabel: formatRelativeTime(topic.created_at),
      body: topic.body,
      removed: isRemoved,
      removedLabel: 'Este tópico foi removido.',
      replyTo: null,
      mentionedNames: [],
    },
    ...posts.map((post) => ({
      id: post.id,
      postId: post.id,
      authorName: authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla',
      timeLabel: formatRelativeTime(post.created_at),
      body: post.body,
      removed: communityContentVisibility(post.status) === 'removed',
      removedLabel: 'Mensagem removida.',
      replyTo: resolveReplyTo(post),
      mentionedNames: mentionsByPost.get(post.id) ?? [],
    })),
  ];

  // Candidatos a menção = participantes já visíveis nesta conversa
  // (autor do tópico + quem já respondeu), exceto o próprio usuário —
  // nenhuma busca nova por perfil: zero query adicional, reaproveita
  // authorsById que já carrega com privacidade aplicada
  // (community_profiles_public). Mencionar alguém fora da conversa
  // exigiria uma busca de perfis mais ampla — gap consciente, fora
  // deste item (ver relatório).
  const mentionCandidates: MentionCandidate[] = [...new Set([topic.author_profile_id, ...posts.map((p) => p.author_profile_id)])]
    .filter((id) => id !== profile.id)
    .map((id) => authorsById.get(id))
    .filter((author): author is NonNullable<typeof author> => Boolean(author))
    .map((author) => ({ profileId: author.profileId, displayName: author.displayName }));

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

      <ProComunidadeTopicChat topicId={topicId} timeline={timeline} mentionCandidates={mentionCandidates} topicRemoved={isRemoved} />
    </main>
  );
}
