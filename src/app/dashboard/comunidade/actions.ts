'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createCommunityPost,
  createCommunityTopic,
  ensureCommunityProfileActivated,
  getCommunityAuthors,
  saveTopic,
  searchCommunityTopics,
  unsaveTopic,
  type CommunityAuthorSnapshot,
} from '@/lib/community/data';
import type { CommunityTopic } from '@/lib/supabase/types';

import { formatRelativeTime } from '../pro-format';
import { getSessionProfile } from '../session';

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
  authorName: string;
  replyCount: number;
  timeLabel: string;
  href: string;
};

function toCard(topic: CommunityTopic, authorsById: Map<string, CommunityAuthorSnapshot>): CommunityTopicCard {
  return {
    id: topic.id,
    title: topic.title,
    authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
    replyCount: topic.reply_count,
    timeLabel: formatRelativeTime(topic.last_activity_at),
    href: `/dashboard/comunidade/${topic.id}`,
  };
}

export async function searchCommunityTopicsAction(query: string): Promise<CommunityTopicCard[]> {
  const { supabase } = await requireArtista();
  const topics = await searchCommunityTopics(supabase, { query, limit: 20 });
  const authorsById = await getCommunityAuthors(supabase, [...new Set(topics.map((t) => t.author_profile_id))]);
  return topics.map((t) => toCard(t, authorsById));
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

export type ReplyActionState = { error?: string };

// Item 4 (08/09/2026) — replyToPostId/mentionedProfileIds passam pelo
// mesmo formData de sempre (hidden inputs no composer), repassados
// direto pra createCommunityPost/create_community_post — que já
// aceitava os dois parâmetros desde a migration 0059, só a UI nunca
// os preenchia.
export async function createReplyAction(topicId: string, _prevState: ReplyActionState, formData: FormData): Promise<ReplyActionState> {
  const { supabase } = await requireArtista();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { error: 'Escreva sua resposta antes de enviar.' };
  const replyToPostId = String(formData.get('replyToPostId') ?? '').trim() || null;
  const mentionedProfileIds = formData.getAll('mentionedProfileIds').map(String).filter(Boolean).slice(0, 10);

  try {
    await createCommunityPost(supabase, { topicId, body, replyToPostId, mentionedProfileIds });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar sua resposta.' };
  }

  revalidatePath(`/dashboard/comunidade/${topicId}`);
  revalidatePath('/dashboard/comunidade');
  return {};
}
