import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CommunityCategory,
  CommunityContentStatus,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPost,
  CommunityProfile,
  CommunityProfilePublic,
  CommunitySavedTopic,
  CommunityTag,
  CommunityTopic,
  CommunityTopicAudience,
  CommunityVisibilityStatus,
} from '@/lib/supabase/types';

// Professional Product UI — Foundation. Boundary tipado sobre o
// backend REAL da Comunidade (migration 0059) — schema/RPCs já
// existem, prontos pra conectar, nunca um schema novo criado aqui.
// Toda regra de audience/visibility/privacy/authorization fica
// SERVIDOR (RLS + community_profiles_public + RPCs security definer)
// — este arquivo nunca reimplementa nada disso, só chama e mapeia.
// NÃO constrói UI — Web e App continuam sem tela de Comunidade
// própria depois deste bloco, só o boundary fica pronto.
//
// V1 é artista-only (RPCs recusam role != 'artista' internamente).
// Sem busca/filtro por texto (tsvector fica pra bloco futuro, gap
// registrado) — só filtro por category_id/tag, que já é suportado
// direto pelas tabelas relacionais existentes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// --- Perfil / privacidade -------------------------------------------

export type CommunityProfileSnapshot = {
  profileId: string;
  visibilityStatus: CommunityVisibilityStatus;
  availableForReferrals: boolean;
  showCity: boolean;
  showAvatar: boolean;
  showBio: boolean;
  showSpecialties: boolean;
  showWorkTypes: boolean;
  showInstagram: boolean;
  showPortfolio: boolean;
  activatedAt: string;
};

function mapCommunityProfile(row: CommunityProfile): CommunityProfileSnapshot {
  return {
    profileId: row.profile_id,
    visibilityStatus: row.visibility_status,
    availableForReferrals: row.available_for_referrals,
    showCity: row.show_city,
    showAvatar: row.show_avatar,
    showBio: row.show_bio,
    showSpecialties: row.show_specialties,
    showWorkTypes: row.show_work_types,
    showInstagram: row.show_instagram,
    showPortfolio: row.show_portfolio,
    activatedAt: row.activated_at,
  };
}

// null = ainda não ativou a Comunidade (nenhuma linha, nunca fabricada).
export async function getMyCommunityProfile(supabase: AnySupabaseClient): Promise<CommunityProfileSnapshot | null> {
  const { data } = await supabase.from('community_profiles').select('*').maybeSingle();
  if (!data) return null;
  return mapCommunityProfile(data as CommunityProfile);
}

// Idempotente — "Entrar na comunidade". Nunca grava nenhuma
// preferência de visibilidade (todas nascem false).
export async function activateCommunityProfile(supabase: AnySupabaseClient): Promise<void> {
  const { error } = await supabase.rpc('activate_community_profile');
  if (error) throw error;
}

export type UpdateCommunityProfileParams = {
  availableForReferrals: boolean;
  showCity: boolean;
  showAvatar: boolean;
  showBio: boolean;
  showSpecialties: boolean;
  showWorkTypes: boolean;
  showInstagram: boolean;
  showPortfolio: boolean;
};

// Nunca aceita visibility_status — moderação é inatingível por aqui.
export async function updateCommunityProfile(supabase: AnySupabaseClient, params: UpdateCommunityProfileParams): Promise<void> {
  const { error } = await supabase.rpc('update_community_profile', {
    p_available_for_referrals: params.availableForReferrals,
    p_show_city: params.showCity,
    p_show_avatar: params.showAvatar,
    p_show_bio: params.showBio,
    p_show_specialties: params.showSpecialties,
    p_show_work_types: params.showWorkTypes,
    p_show_instagram: params.showInstagram,
    p_show_portfolio: params.showPortfolio,
  });
  if (error) throw error;
}

export type CommunityAuthorSnapshot = {
  profileId: string;
  displayName: string;
  professionLabel: string | null;
  isPro: boolean;
  isIncomplete: boolean;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
};

function mapAuthorSnapshot(row: CommunityProfilePublic): CommunityAuthorSnapshot {
  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    professionLabel: row.profession_label,
    isPro: row.is_pro,
    isIncomplete: row.is_incomplete,
    city: row.city,
    state: row.state,
    avatarUrl: row.avatar_url,
  };
}

// Única leitura segura de OUTRO profissional na Comunidade — aplica
// as preferências show_* no servidor (community_profiles_public,
// migration 0059), nunca o client escondendo campo depois.
export async function getCommunityAuthors(supabase: AnySupabaseClient, profileIds: string[]): Promise<Map<string, CommunityAuthorSnapshot>> {
  if (profileIds.length === 0) return new Map();
  const { data, error } = await supabase.from('community_profiles_public').select('*').in('profile_id', profileIds);
  if (error) throw error;
  return new Map(((data ?? []) as CommunityProfilePublic[]).map((row) => [row.profile_id, mapAuthorSnapshot(row)]));
}

// --- Taxonomia --------------------------------------------------------

export async function listCommunityCategories(supabase: AnySupabaseClient): Promise<CommunityCategory[]> {
  const { data, error } = await supabase.from('community_categories').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityCategory[];
}

export async function listCommunityTags(supabase: AnySupabaseClient): Promise<CommunityTag[]> {
  const { data, error } = await supabase.from('community_tags').select('*').eq('active', true).order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityTag[];
}

// --- Tópicos / posts ---------------------------------------------------

export type ListCommunityTopicsParams = {
  categoryId?: string;
  tagId?: string;
  limit?: number;
  cursor?: string | null;
};

// Sem busca por texto (gap registrado — 0059 nunca teve tsvector, é
// bloco futuro explícito). Só filtro estrutural por categoria/tag.
// Paginação por last_activity_at (cursor = valor da última linha lida).
export async function listCommunityTopics(supabase: AnySupabaseClient, params: ListCommunityTopicsParams = {}): Promise<CommunityTopic[]> {
  let query = supabase
    .from('community_topics')
    .select('*')
    .order('last_activity_at', { ascending: false })
    .limit(params.limit ?? 20);

  if (params.categoryId) query = query.eq('category_id', params.categoryId);
  if (params.cursor) query = query.lt('last_activity_at', params.cursor);

  if (params.tagId) {
    const { data: taggedIds, error: tagError } = await supabase.from('community_topic_tags').select('topic_id').eq('tag_id', params.tagId);
    if (tagError) throw tagError;
    const ids = (taggedIds ?? []).map((row: { topic_id: string }) => row.topic_id);
    if (ids.length === 0) return [];
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CommunityTopic[];
}

export async function getCommunityTopic(supabase: AnySupabaseClient, topicId: string): Promise<CommunityTopic | null> {
  const { data } = await supabase.from('community_topics').select('*').eq('id', topicId).maybeSingle();
  return (data as CommunityTopic | null) ?? null;
}

export async function listCommunityPosts(supabase: AnySupabaseClient, topicId: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase.from('community_posts').select('*').eq('topic_id', topicId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

export type CreateCommunityTopicParams = {
  title: string;
  body: string;
  categoryId: string;
  audience?: CommunityTopicAudience;
  tagIds?: string[];
};

export async function createCommunityTopic(supabase: AnySupabaseClient, params: CreateCommunityTopicParams): Promise<string> {
  const { data, error } = await supabase
    .rpc('create_community_topic', {
      p_title: params.title,
      p_body: params.body,
      p_category_id: params.categoryId,
      p_audience: params.audience ?? 'all',
      p_tag_ids: params.tagIds ?? [],
    })
    .single();
  if (error || !data) throw error ?? new Error('create_community_topic: sem dado');
  return data as string;
}

export async function removeCommunityTopic(supabase: AnySupabaseClient, topicId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_community_topic', { p_topic_id: topicId });
  if (error) throw error;
}

export type CreateCommunityPostParams = {
  topicId: string;
  body: string;
  replyToPostId?: string | null;
  mentionedProfileIds?: string[];
};

export async function createCommunityPost(supabase: AnySupabaseClient, params: CreateCommunityPostParams): Promise<string> {
  const { data, error } = await supabase
    .rpc('create_community_post', {
      p_topic_id: params.topicId,
      p_body: params.body,
      p_reply_to_post_id: params.replyToPostId ?? null,
      p_mentioned_profile_ids: params.mentionedProfileIds ?? [],
    })
    .single();
  if (error || !data) throw error ?? new Error('create_community_post: sem dado');
  return data as string;
}

export async function removeCommunityPost(supabase: AnySupabaseClient, postId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_community_post', { p_post_id: postId });
  if (error) throw error;
}

// --- Salvos -------------------------------------------------------------

// Único caso de escrita direta (RLS, não RPC) — toggle puro, sem
// contador nem efeito colateral (migration 0059).
export async function listSavedTopicIds(supabase: AnySupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from('community_saved_topics').select('topic_id');
  if (error) throw error;
  return ((data ?? []) as CommunitySavedTopic[]).map((row) => row.topic_id);
}

export async function saveTopic(supabase: AnySupabaseClient, topicId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('community_saved_topics').insert({ profile_id: profileId, topic_id: topicId });
  if (error) throw error;
}

export async function unsaveTopic(supabase: AnySupabaseClient, topicId: string): Promise<void> {
  const { error } = await supabase.from('community_saved_topics').delete().eq('topic_id', topicId);
  if (error) throw error;
}

// --- Notificações da Comunidade -----------------------------------------
// Escopo só Comunidade (0059) — nunca a central de notificações
// genérica do produto (que não existe ainda, ver PROGRESS.md).

export type CommunityNotificationItem = {
  id: string;
  type: CommunityNotificationType;
  topicId: string;
  postId: string | null;
  actorProfileId: string;
  readAt: string | null;
  createdAt: string;
};

function mapNotification(row: CommunityNotification): CommunityNotificationItem {
  return {
    id: row.id,
    type: row.type,
    topicId: row.topic_id,
    postId: row.post_id,
    actorProfileId: row.actor_profile_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function listCommunityNotifications(supabase: AnySupabaseClient): Promise<CommunityNotificationItem[]> {
  const { data, error } = await supabase.from('community_notifications').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CommunityNotification[]).map(mapNotification);
}

export async function markCommunityNotificationRead(supabase: AnySupabaseClient, notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_community_notification_read', { p_notification_id: notificationId });
  if (error) throw error;
}

// --- Status derivado (função pura, seguro duplicar em Mobile) ----------

export type CommunityContentVisibility = 'visible' | 'removed';

export function communityContentVisibility(status: CommunityContentStatus): CommunityContentVisibility {
  return status === 'published' ? 'visible' : 'removed';
}
