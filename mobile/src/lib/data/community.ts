import { supabase } from '@/lib/supabase';
import type {
  CommunityCategory,
  CommunityContentStatus,
  CommunityMention,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPost,
  CommunityProfile,
  CommunityProfilePublic,
  CommunityTag,
  CommunityTopic,
  CommunityTopicAudience,
  CommunityVisibilityStatus,
} from '@/types/community';

// Espelha src/lib/community/data.ts (painel web) — mesmo backend real
// (migration 0059), mesmas RPCs, mesma RLS. Cópia deliberada. Desde a
// Fase 1 da rodada search-first (06/09/2026), app/forum/* consome
// este arquivo direto — forumMock.ts foi deletado, não existe mais
// nenhuma fonte de dado fabricada no Fórum.

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

export async function fetchMyCommunityProfile(): Promise<CommunityProfileSnapshot | null> {
  const { data, error } = await supabase.from('community_profiles').select('*').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapCommunityProfile(data as CommunityProfile);
}

export async function activateCommunityProfile(): Promise<void> {
  const { error } = await supabase.rpc('activate_community_profile');
  if (error) throw error;
}

// Fase 1 (06/09/2026) — espelha ensureCommunityProfileActivated do
// painel web. Chamado no topo de toda tela de Comunidade.
export async function ensureCommunityProfileActivated(): Promise<void> {
  const existing = await fetchMyCommunityProfile();
  if (!existing) await activateCommunityProfile();
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

export async function updateCommunityProfile(params: UpdateCommunityProfileParams): Promise<void> {
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
  publicId: string | null;
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
    publicId: row.public_id,
  };
}

export async function fetchCommunityAuthors(profileIds: string[]): Promise<Map<string, CommunityAuthorSnapshot>> {
  if (profileIds.length === 0) return new Map();
  const { data, error } = await supabase.from('community_profiles_public').select('*').in('profile_id', profileIds);
  if (error) throw error;
  return new Map(((data ?? []) as CommunityProfilePublic[]).map((row) => [row.profile_id, mapAuthorSnapshot(row)]));
}

export async function fetchCommunityCategories(): Promise<CommunityCategory[]> {
  const { data, error } = await supabase.from('community_categories').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityCategory[];
}

export async function fetchCommunityTags(): Promise<CommunityTag[]> {
  const { data, error } = await supabase.from('community_tags').select('*').eq('active', true).order('label', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CommunityTag[];
}

export type FetchCommunityTopicsParams = {
  categoryId?: string;
  tagId?: string;
  limit?: number;
  cursor?: string | null;
};

// Sem busca por texto (gap registrado, mesmo do Web) — só filtro por
// categoria/tag.
export async function fetchCommunityTopics(params: FetchCommunityTopicsParams = {}): Promise<CommunityTopic[]> {
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

// Fase 1 da busca search-first (06/09/2026) — migration 0068. Espelha
// searchCommunityTopics (painel web) — mesma RPC, mesmo ranking
// (título > corpo, boost de categoria/tag), sem paginação.
export type SearchCommunityTopicsParams = {
  query: string;
  categoryId?: string | null;
  tagId?: string | null;
  limit?: number;
};

export async function searchCommunityTopics(params: SearchCommunityTopicsParams): Promise<CommunityTopic[]> {
  const { data, error } = await supabase.rpc('search_community_topics', {
    p_query: params.query,
    p_category_id: params.categoryId ?? null,
    p_tag_id: params.tagId ?? null,
    p_limit: params.limit ?? 20,
  });
  if (error) throw error;
  return (data ?? []) as CommunityTopic[];
}

// Espelha listCommunityTopicsByIds do painel web — usado por "Salvos".
export async function fetchCommunityTopicsByIds(ids: string[], limit = 20): Promise<CommunityTopic[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('community_topics')
    .select('*')
    .in('id', ids)
    .order('last_activity_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CommunityTopic[];
}

export async function fetchCommunityTopic(topicId: string): Promise<CommunityTopic | null> {
  const { data, error } = await supabase.from('community_topics').select('*').eq('id', topicId).maybeSingle();
  if (error) throw error;
  return (data as CommunityTopic | null) ?? null;
}

export type CommunityPostsCursor = { createdAt: string; id: string };
export type CommunityPostsPage = { posts: CommunityPost[]; hasMore: boolean };

// Correção do Item 5 (08/09/2026) — espelha listCommunityPostsPage do
// painel web: direção trocada pra "mais recentes primeiro, carregar
// anteriores sob demanda" (arquitetura C). Sem cursor (`before`
// omitido) = a página mais recente; com cursor = a página
// imediatamente anterior a ela. Mesmo cursor (created_at, id) de
// antes, só invertendo comparação (`lt`) e ordenação (`desc`) — sem
// RPC nova.
export async function fetchCommunityPostsPage(
  topicId: string,
  params: { limit?: number; before?: CommunityPostsCursor } = {}
): Promise<CommunityPostsPage> {
  const limit = params.limit ?? 20;
  let query = supabase
    .from('community_posts')
    .select('*')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (params.before) {
    query = query.or(`created_at.lt.${params.before.createdAt},and(created_at.eq.${params.before.createdAt},id.lt.${params.before.id})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as CommunityPost[];
  const hasMore = rows.length > limit;
  const posts = rows.slice(0, limit).reverse();
  return { posts, hasMore };
}

// Espelha listCommunityPostsByIds do painel web. Com a paginação
// "recentes primeiro", o alvo de um reply-to pode legitimamente estar
// fora de QUALQUER página já carregada (uma resposta perto do fim pode
// citar algo lá do começo, ainda não buscado) — usada pra resolver
// esses poucos ids pontuais; a tela decide, com base no que já está
// carregado, se isso vira toque-pra-pular ou só uma referência visual.
export async function fetchCommunityPostsByIds(ids: string[]): Promise<CommunityPost[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('community_posts').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

// Item 4 (08/09/2026) — espelha listCommunityMentions do painel web.
// Leitura que faltava sobre community_mentions (migration 0059, nunca
// lida antes) — RLS já libera pra qualquer autenticado ver menções de
// um post publicado, nenhuma tabela/RPC nova.
export async function fetchCommunityMentions(postIds: string[]): Promise<CommunityMention[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await supabase.from('community_mentions').select('*').in('post_id', postIds);
  if (error) throw error;
  return (data ?? []) as CommunityMention[];
}

export type CreateCommunityTopicParams = {
  title: string;
  body: string;
  categoryId: string;
  audience?: CommunityTopicAudience;
  tagIds?: string[];
};

export async function createCommunityTopic(params: CreateCommunityTopicParams): Promise<string> {
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

export async function removeCommunityTopic(topicId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_community_topic', { p_topic_id: topicId });
  if (error) throw error;
}

export type CreateCommunityPostParams = {
  topicId: string;
  body: string;
  replyToPostId?: string | null;
  mentionedProfileIds?: string[];
};

export async function createCommunityPost(params: CreateCommunityPostParams): Promise<string> {
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

export async function removeCommunityPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_community_post', { p_post_id: postId });
  if (error) throw error;
}

export async function fetchSavedTopicIds(): Promise<string[]> {
  const { data, error } = await supabase.from('community_saved_topics').select('topic_id');
  if (error) throw error;
  return ((data ?? []) as { topic_id: string }[]).map((row) => row.topic_id);
}

export async function saveTopic(topicId: string, profileId: string): Promise<void> {
  const { error } = await supabase.from('community_saved_topics').insert({ profile_id: profileId, topic_id: topicId });
  if (error) throw error;
}

export async function unsaveTopic(topicId: string): Promise<void> {
  const { error } = await supabase.from('community_saved_topics').delete().eq('topic_id', topicId);
  if (error) throw error;
}

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

export async function fetchCommunityNotifications(): Promise<CommunityNotificationItem[]> {
  const { data, error } = await supabase.from('community_notifications').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CommunityNotification[]).map(mapNotification);
}

export async function markCommunityNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_community_notification_read', { p_notification_id: notificationId });
  if (error) throw error;
}

export type CommunityContentVisibility = 'visible' | 'removed';

export function communityContentVisibility(status: CommunityContentStatus): CommunityContentVisibility {
  return status === 'published' ? 'visible' : 'removed';
}

// Item @menções (08/09/2026) — espelha buildMentionCandidateDisplay do
// painel web (src/lib/community/data.ts) — mesma lógica pura,
// duplicada aqui por convenção do repo (ver communityContentVisibility
// acima). Identidade técnica da menção continua sendo profileId; isto
// é só desambiguação visual (profissão+cidade, terceiro nível com o
// identificador público estável só quando dois OU MAIS candidatos, no
// mesmo conjunto mostrado, ficariam visualmente idênticos).
export type MentionCandidateInfo = {
  profileId: string;
  displayName: string;
  professionLabel: string | null;
  city: string | null;
  state: string | null;
  publicId: string | null;
};

export type MentionCandidateDisplay = MentionCandidateInfo & {
  subtitle: string | null;
  tieBreaker: string | null;
};

function mentionCandidateSubtitle(candidate: MentionCandidateInfo): string | null {
  const location = candidate.city && candidate.state ? `${candidate.city}, ${candidate.state}` : null;
  if (candidate.professionLabel && location) return `${candidate.professionLabel} · ${location}`;
  if (candidate.professionLabel) return candidate.professionLabel;
  if (location) return location;
  return null;
}

export function buildMentionCandidateDisplay(candidates: MentionCandidateInfo[]): MentionCandidateDisplay[] {
  const withSubtitle = candidates.map((c) => ({ ...c, subtitle: mentionCandidateSubtitle(c) }));
  const groupKey = (c: { displayName: string; subtitle: string | null }) => `${c.displayName}|${c.subtitle ?? ''}`;
  const groupCounts = new Map<string, number>();
  for (const c of withSubtitle) groupCounts.set(groupKey(c), (groupCounts.get(groupKey(c)) ?? 0) + 1);
  return withSubtitle.map((c) => ({
    ...c,
    tieBreaker: (groupCounts.get(groupKey(c)) ?? 0) > 1 && c.publicId ? `@${c.publicId}` : null,
  }));
}
