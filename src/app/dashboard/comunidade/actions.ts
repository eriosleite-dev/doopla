'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  communityContentVisibility,
  createCommunityPost,
  createCommunityTopic,
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  listCommunityPostsByIds,
  markCommunityNotificationRead,
  removeCommunityPost,
  removeCommunityTopic,
  saveTopic,
  searchCommunityTopics,
  unsaveTopic,
  type CommunityAuthorSnapshot,
  type CommunityPostsCursor,
} from '@/lib/community/data';
import type { CommunityTopic } from '@/lib/supabase/types';

import { formatRelativeTime } from '../pro-format';
import { getSessionProfile } from '../session';
import { COMMUNITY_POSTS_PAGE_SIZE, loadCommunityPostsPage, snippetOf, type ChatTimelineMessage } from './[topicId]/timeline';

// Comunidade — Fase 1 (06/09/2026). Só profissionais (artista) têm
// Comunidade hoje — mesmo gate já aplicado pelas RPCs (migration 0059),
// reforçado aqui como segunda camada, nunca a única.
async function requireArtista() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');
  return { supabase, user, profile };
}

export type CommunityTopicCard = {
  id: string;
  title: string;
  // Item 6 — correção do ••• ausente nos cards (08/09/2026): precisa do
  // profile_id real do autor pra decidir se o card mostra o menu de
  // exclusão — nunca comparar por authorName (não é identificador
  // único, ver a investigação de homônimos em @menções).
  authorProfileId: string;
  authorName: string;
  replyCount: number;
  timeLabel: string;
  href: string;
};

function toCard(topic: CommunityTopic, authorsById: Map<string, CommunityAuthorSnapshot>): CommunityTopicCard {
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

// categoryId (08/09/2026, filtro por categoria na Web) — query vazia +
// categoryId setado é um caso já suportado pelo RPC search_community_topics
// (migration 0068): tsquery vazia bypassa o match de texto (q.tsq::text
// = ''), sobrando só o filtro de categoria + ordenação por
// last_activity_at — mesmo comportamento de "recentes filtrados por
// categoria", nunca uma segunda query/RPC nova. Decisão de produto
// (comentário de pro-comunidade-home-view.tsx) continua valendo: busca
// é o mecanismo principal, categoria nunca vira grade de chips
// dominando a tela — aqui é só um parâmetro a mais do mesmo fluxo de
// busca já existente.
export async function searchCommunityTopicsAction(query: string, categoryId?: string | null): Promise<CommunityTopicCard[]> {
  const { supabase } = await requireArtista();
  const topics = await searchCommunityTopics(supabase, { query, categoryId, limit: 20 });
  const authorsById = await getCommunityAuthors(supabase, [...new Set(topics.map((t) => t.author_profile_id))]);
  return topics.map((t) => toCard(t, authorsById));
}

// Notificações da Comunidade — UI (08/09/2026). Schema/RPC já existiam
// desde a migration 0059 (community_notifications, mark_community_notification_read),
// nunca conectados a nenhuma tela. Nenhuma migration/RPC nova aqui.
// `text` já vem pronto do servidor (page.tsx) — nunca recomputado no
// client a partir de type/actorName, uma única fonte da cópia por tipo.
export type CommunityNotificationCard = {
  id: string;
  text: string;
  readAt: string | null;
  timeLabel: string;
  href: string;
};

export async function markCommunityNotificationReadAction(notificationId: string): Promise<{ ok: true } | { error: string }> {
  const { supabase } = await requireArtista();
  try {
    await markCommunityNotificationRead(supabase, notificationId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível marcar como lida.' };
  }
  return { ok: true };
}

export async function toggleSaveTopicAction(topicId: string, save: boolean): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireArtista();
  try {
    if (save) await saveTopic(supabase, topicId, user.id);
    else await unsaveTopic(supabase, topicId);
    revalidatePath('/dashboard/comunidade');
    revalidatePath('/dashboard/comunidade/salvos');
    revalidatePath(`/dashboard/comunidade/${topicId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export type CreateTopicActionState = { error?: string };

export async function createTopicAction(_prevState: CreateTopicActionState, formData: FormData): Promise<CreateTopicActionState> {
  const { supabase } = await requireArtista();

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const tagIds = formData.getAll('tagIds').map(String).filter(Boolean).slice(0, 5);

  if (title.length < 3) return { error: 'O título precisa ter pelo menos 3 caracteres.' };
  if (!body) return { error: 'Escreva o que você quer perguntar ou discutir.' };
  if (!categoryId) return { error: 'Escolha uma categoria.' };

  await ensureCommunityProfileActivated(supabase);

  let topicId: string;
  try {
    topicId = await createCommunityTopic(supabase, { title, body, categoryId, tagIds });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível criar o tópico.' };
  }

  revalidatePath('/dashboard/comunidade');
  redirect(`/dashboard/comunidade/${topicId}`);
}

export type ReplyActionState = { error?: string; post?: ChatTimelineMessage };

// Item 4 (08/09/2026) — replyToPostId/mentionedProfileIds passam pelo
// mesmo formData de sempre (hidden inputs no composer), repassados
// direto pra createCommunityPost/create_community_post — que já
// aceitava os dois parâmetros desde a migration 0059, só a UI nunca
// os preenchia.
//
// Correção do Item 5 (08/09/2026) — SEM revalidatePath desta rota: o
// tópico agora pagina no client (ver
// [topicId]/pro-comunidade-topic-view.tsx), e um revalidate
// reexecutaria page.tsx do zero, devolvendo de novo só a página mais
// recente e derrubando qualquer página anterior que o client já
// tivesse carregado via "carregar anteriores". Em vez disso, esta
// action sempre devolve a mensagem pronta pra o client anexar direto
// ao fim da lista. Isso é seguro porque a paginação agora é
// "recentes primeiro": o que já está carregado sempre inclui a borda
// mais nova conhecida até aqui — uma resposta recém-criada é sempre
// cronologicamente posterior a tudo isso, nunca cria buraco (não
// existe mais o cenário "cliente atrasado" que a v1 deste item
// precisava tratar com o parâmetro caughtUp). A única lacuna possível
// é a mesma de sempre nesta funcionalidade sem realtime: uma resposta
// de OUTRO usuário criada entre o último carregamento e agora só
// aparece ao reabrir o tópico — fora de escopo aqui (realtime
// explicitamente não implementado).
export async function createReplyAction(topicId: string, _prevState: ReplyActionState, formData: FormData): Promise<ReplyActionState> {
  const { supabase, user } = await requireArtista();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escreva sua resposta antes de enviar.' };
  const replyToPostId = String(formData.get('replyToPostId') ?? '').trim() || null;
  const mentionedProfileIds = formData.getAll('mentionedProfileIds').map(String).filter(Boolean).slice(0, 10);

  let postId: string;
  try {
    postId = await createCommunityPost(supabase, { topicId, body, replyToPostId, mentionedProfileIds });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar sua resposta.' };
  }

  revalidatePath('/dashboard/comunidade');

  const rows = await listCommunityPostsByIds(supabase, [postId, ...(replyToPostId ? [replyToPostId] : [])]);
  const newPost = rows.find((r) => r.id === postId);
  if (!newPost) return {};
  const replyTargetRow = replyToPostId ? (rows.find((r) => r.id === replyToPostId) ?? null) : null;

  const authorIds = new Set<string>([user.id, ...mentionedProfileIds]);
  if (replyTargetRow) authorIds.add(replyTargetRow.author_profile_id);
  const authorsById = await getCommunityAuthors(supabase, [...authorIds]);

  const mentionedNames = mentionedProfileIds.map((id) => authorsById.get(id)?.displayName).filter((n): n is string => Boolean(n));
  const replyTo = replyTargetRow
    ? {
        postId: replyTargetRow.id,
        authorName: authorsById.get(replyTargetRow.author_profile_id)?.displayName ?? 'Profissional Doopla',
        snippet: snippetOf(replyTargetRow.body),
        removed: communityContentVisibility(replyTargetRow.status) === 'removed',
      }
    : null;

  const author = authorsById.get(user.id);
  const post: ChatTimelineMessage = {
    id: newPost.id,
    postId: newPost.id,
    authorProfileId: user.id,
    authorName: author?.displayName ?? 'Profissional Doopla',
    authorProfessionLabel: author?.professionLabel ?? null,
    authorCity: author?.city ?? null,
    authorState: author?.state ?? null,
    authorPublicId: author?.publicId ?? null,
    timeLabel: formatRelativeTime(newPost.created_at),
    createdAt: newPost.created_at,
    body: newPost.body,
    removed: false,
    removedLabel: 'Mensagem removida.',
    replyTo,
    mentionedNames,
  };

  return { post };
}

export type RemoveActionResult = { ok: true } | { error: string };

// Item 6 (08/09/2026, "Menu ••• + exclusão") — só usa as RPCs
// soft-delete que já existem desde a migration 0059
// (remove_community_topic/remove_community_post); ownership é
// verificado inteiramente dentro delas (author_profile_id =
// auth.uid()), nunca reconferido aqui. Sem revalidatePath da rota do
// tópico (mesma razão de createReplyAction acima: o client é dono do
// estado paginado, ver pro-comunidade-topic-view.tsx) — a exclusão do
// post é aplicada otimisticamente no client depois da RPC confirmar.
// A exclusão do tópico revalida só a lista/Salvos (onde o card
// removido precisa sumir); o client sai da rota do tópico por conta
// própria assim que esta action retorna sucesso.
export async function removeTopicAction(topicId: string): Promise<RemoveActionResult> {
  const { supabase } = await requireArtista();
  try {
    await removeCommunityTopic(supabase, topicId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível excluir o tópico.' };
  }
  revalidatePath('/dashboard/comunidade');
  revalidatePath('/dashboard/comunidade/salvos');
  return { ok: true };
}

export async function removePostAction(postId: string): Promise<RemoveActionResult> {
  const { supabase } = await requireArtista();
  try {
    await removeCommunityPost(supabase, postId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível excluir a mensagem.' };
  }
  return { ok: true };
}

export type LoadEarlierCommunityPostsResult = { messages: ChatTimelineMessage[]; hasMore: boolean } | { error: string };

// Correção do Item 5 (08/09/2026) — "carregar mensagens anteriores":
// busca a página imediatamente anterior ao cursor (created_at, id) do
// post mais ANTIGO já carregado no client. Nunca revalida a rota
// inteira — devolve só a página nova, pronta pra ser inserida no
// início da lista de respostas já carregadas (depois da mensagem de
// abertura do tópico, que nunca é paginada).
export async function loadEarlierCommunityPostsAction(topicId: string, before: CommunityPostsCursor): Promise<LoadEarlierCommunityPostsResult> {
  const { supabase } = await requireArtista();
  try {
    return await loadCommunityPostsPage(supabase, topicId, { limit: COMMUNITY_POSTS_PAGE_SIZE, before });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível carregar mensagens anteriores.' };
  }
}
