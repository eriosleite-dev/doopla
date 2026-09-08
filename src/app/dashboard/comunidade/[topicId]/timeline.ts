import type { SupabaseClient } from '@supabase/supabase-js';

import {
  communityContentVisibility,
  getCommunityAuthors,
  listCommunityMentions,
  listCommunityPostsByIds,
  listCommunityPostsPage,
  type CommunityAuthorSnapshot,
  type CommunityPostsCursor,
} from '@/lib/community/data';
import type { CommunityPost, CommunityTopic } from '@/lib/supabase/types';

import { formatRelativeTime } from '../../pro-format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Item 5 (08/09/2026) — módulo plano (nem 'use client' nem 'use
// server'), importável tanto pelo Server Component (page.tsx, primeiro
// load) quanto pela Server Action de paginação (actions.ts, "carregar
// mais") — uma única fonte de verdade pra "como um post vira uma
// ChatTimelineMessage", nunca duas implementações divergentes.
//
// Tamanho de página: 20, mesmo número já usado em toda a Comunidade
// pra "quantidade inicial razoável" (Recentes, busca, Salvos) — sem
// inventar um valor novo.
export const COMMUNITY_POSTS_PAGE_SIZE = 20;

export type ChatTimelineMessage = {
  id: string;
  // null = mensagem de abertura do tópico (nunca "respondível" — não
  // existe coluna equivalente a reply_to_post_id que aponte pro
  // tópico em si, só entre community_posts). Um valor aqui é sempre
  // um post.id real.
  postId: string | null;
  authorProfileId: string;
  authorName: string;
  timeLabel: string;
  // ISO cru (não só o rótulo formatado) — é o que vira cursor de
  // paginação (createdAt do último post carregado) e nunca precisa
  // ser recomputado no client.
  createdAt: string;
  body: string;
  removed: boolean;
  removedLabel: string;
  replyTo: { postId: string; authorName: string; snippet: string; removed: boolean } | null;
  mentionedNames: string[];
};

export function snippetOf(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function topicToTimelineMessage(topic: CommunityTopic, authorsById: Map<string, CommunityAuthorSnapshot>): ChatTimelineMessage {
  return {
    id: topic.id,
    postId: null,
    authorProfileId: topic.author_profile_id,
    authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
    timeLabel: formatRelativeTime(topic.created_at),
    createdAt: topic.created_at,
    body: topic.body,
    removed: communityContentVisibility(topic.status) === 'removed',
    removedLabel: 'Este tópico foi removido.',
    replyTo: null,
    mentionedNames: [],
  };
}

function toTimelineMessage(
  post: CommunityPost,
  authorsById: Map<string, CommunityAuthorSnapshot>,
  postsById: Map<string, CommunityPost>,
  mentionsByPost: Map<string, string[]>
): ChatTimelineMessage {
  let replyTo: ChatTimelineMessage['replyTo'] = null;
  if (post.reply_to_post_id) {
    const target = postsById.get(post.reply_to_post_id);
    if (target) {
      const targetRemoved = communityContentVisibility(target.status) === 'removed';
      replyTo = {
        postId: target.id,
        authorName: authorsById.get(target.author_profile_id)?.displayName ?? 'Profissional Doopla',
        snippet: targetRemoved ? '' : snippetOf(target.body),
        removed: targetRemoved,
      };
    }
  }
  return {
    id: post.id,
    postId: post.id,
    authorProfileId: post.author_profile_id,
    authorName: authorsById.get(post.author_profile_id)?.displayName ?? 'Profissional Doopla',
    timeLabel: formatRelativeTime(post.created_at),
    createdAt: post.created_at,
    body: post.body,
    removed: communityContentVisibility(post.status) === 'removed',
    removedLabel: 'Mensagem removida.',
    replyTo,
    mentionedNames: mentionsByPost.get(post.id) ?? [],
  };
}

// Busca uma página de respostas já totalmente resolvida (autores,
// menções, citação de reply-to) — chamada tanto pelo primeiro load
// (mais recentes) quanto por "carregar anteriores", sempre a mesma
// lógica. Diferente da v1 deste item, a paginação agora vem de trás
// pra frente (mais recentes primeiro) — o alvo de um reply-to pode
// legitimamente estar fora de QUALQUER página já carregada. A busca
// pontual abaixo resolve autor/corpo/status desse alvo mesmo assim
// (pra citação nunca ficar vazia), mas NÃO garante que ele esteja
// entre as mensagens renderizadas — quem decide se isso vira link
// clicável é o client, comparando com o que já tem carregado (ver
// pro-comunidade-topic-view.tsx / mobile forum/[topicId].tsx).
export async function loadCommunityPostsPage(
  supabase: AnySupabaseClient,
  topicId: string,
  params: { limit?: number; before?: CommunityPostsCursor } = {}
): Promise<{ messages: ChatTimelineMessage[]; hasMore: boolean }> {
  const { posts, hasMore } = await listCommunityPostsPage(supabase, topicId, params);

  const postsById = new Map(posts.map((p) => [p.id, p]));
  const missingTargetIds = [
    ...new Set(posts.map((p) => p.reply_to_post_id).filter((id): id is string => id !== null && !postsById.has(id))),
  ];
  if (missingTargetIds.length > 0) {
    const missingPosts = await listCommunityPostsByIds(supabase, missingTargetIds);
    for (const p of missingPosts) postsById.set(p.id, p);
  }

  const mentions = await listCommunityMentions(supabase, posts.map((p) => p.id));

  const authorIds = new Set<string>();
  for (const p of posts) authorIds.add(p.author_profile_id);
  for (const p of postsById.values()) authorIds.add(p.author_profile_id);
  for (const m of mentions) authorIds.add(m.mentioned_profile_id);
  const authorsById = await getCommunityAuthors(supabase, [...authorIds]);

  const mentionsByPost = new Map<string, string[]>();
  for (const mention of mentions) {
    const name = authorsById.get(mention.mentioned_profile_id)?.displayName;
    if (!name) continue;
    mentionsByPost.set(mention.post_id, [...(mentionsByPost.get(mention.post_id) ?? []), name]);
  }

  const messages = posts.map((post) => toTimelineMessage(post, authorsById, postsById, mentionsByPost));
  return { messages, hasMore };
}
