import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CommunityCategory,
  CommunityContentStatus,
  CommunityMention,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPost,
  CommunityProfile,
  CommunityProfilePublic,
  CommunitySavedTopic,
  CommunityTag,
  CommunityTopic,
  CommunityTopicAudience,
  CommunityTopicRead,
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

// Fase 1 (06/09/2026) — chamado no topo de toda página de Comunidade
// (não só a Home), pra "entrar na comunidade" ser invisível pro
// profissional: nenhum passo explícito de "ativar perfil" na UX,
// idempotente por natureza da RPC.
export async function ensureCommunityProfileActivated(supabase: AnySupabaseClient): Promise<void> {
  const existing = await getMyCommunityProfile(supabase);
  if (!existing) await activateCommunityProfile(supabase);
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

// Fase 1 da busca search-first (06/09/2026) — migration 0068.
// websearch_to_tsquery('portuguese', ...), ranking peso maior pro
// título, boost quando categoria/tag do tópico bate com a busca. Sem
// paginação (limit simples) — resultado de busca não é o feed
// principal, não precisa de cursor. Query vazia/whitespace equivale a
// "sem filtro de texto" (mesmo comportamento de listCommunityTopics,
// só que sem cursor).
export type SearchCommunityTopicsParams = {
  query: string;
  categoryId?: string | null;
  tagId?: string | null;
  limit?: number;
};

export async function searchCommunityTopics(supabase: AnySupabaseClient, params: SearchCommunityTopicsParams): Promise<CommunityTopic[]> {
  const { data, error } = await supabase.rpc('search_community_topics', {
    p_query: params.query,
    p_category_id: params.categoryId ?? null,
    p_tag_id: params.tagId ?? null,
    p_limit: params.limit ?? 20,
  });
  if (error) throw error;
  return (data ?? []) as CommunityTopic[];
}

// Usado pra "Salvos" (Home preview + página dedicada) — busca tópicos
// específicos por id, mesma RLS "select visible" de sempre. Ordena por
// atividade recente, não pela ordem dos ids.
export async function listCommunityTopicsByIds(supabase: AnySupabaseClient, ids: string[], limit = 20): Promise<CommunityTopic[]> {
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

export async function getCommunityTopic(supabase: AnySupabaseClient, topicId: string): Promise<CommunityTopic | null> {
  const { data } = await supabase.from('community_topics').select('*').eq('id', topicId).maybeSingle();
  return (data as CommunityTopic | null) ?? null;
}

export type CommunityPostsCursor = { createdAt: string; id: string };
export type CommunityPostsPage = { posts: CommunityPost[]; hasMore: boolean };

// Correção do Item 5 (08/09/2026) — direção trocada pra "mais
// recentes primeiro, carregar anteriores sob demanda" (arquitetura C,
// aprovada após auditoria: pousar sempre no início não escala pra
// tópicos longos, e exigiria a mesma correção de scroll-anchor em
// layout.tsx mais tarde de qualquer forma quando o Item 12 chegasse —
// ver navigation-guard.tsx/layout.tsx). Sem cursor (`before` omitido)
// = a página mais recente. Com cursor = a página imediatamente
// anterior a ela, nunca a seguinte.
//
// `id` é uuid aleatório (não ordenável por si só), então o cursor é
// sempre (created_at, id) — id só entra como desempate determinístico
// em caso de created_at igual, nunca como critério principal. Sem RPC
// nova: o desempate é expresso direto no filtro `.or()` do PostgREST
// (`created_at < cursor` OU `created_at = cursor E id < cursor`), a
// mesma RLS de sempre ("select visible") continua se aplicando por
// baixo. Busca limit+1 pra saber se há mais sem uma segunda query de
// contagem; devolve sempre em ordem cronológica ascendente (a busca
// interna é DESC pra pegar "as mais recentes", o resultado final é
// invertido antes de devolver).
export async function listCommunityPostsPage(
  supabase: AnySupabaseClient,
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

// A paginação carrega sempre a partir das mensagens mais recentes,
// avançando pra trás sob demanda — diferente do prefixo contínuo da
// v1 deste item, aqui o alvo de um reply-to pode legitimamente estar
// fora de QUALQUER página já carregada (uma resposta perto do fim
// pode citar algo lá do começo, ainda não buscado). Usada pra
// resolver esses poucos ids pontuais (nunca a listagem inteira) — a
// UI decide, com base no que já está carregado, se isso vira um link
// clicável ou só uma referência visual sem link (ver
// pro-comunidade-topic-view.tsx / mobile forum/[topicId].tsx).
export async function listCommunityPostsByIds(supabase: AnySupabaseClient, ids: string[]): Promise<CommunityPost[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('community_posts').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

// Item 4 (08/09/2026) — leitura que faltava pra usar community_mentions
// (migration 0059, nunca lida antes). RLS ("select relevant") já
// libera pra qualquer autenticado ver menções de um post publicado —
// nenhuma tabela/RPC nova, só esta query direta.
export async function listCommunityMentions(supabase: AnySupabaseClient, postIds: string[]): Promise<CommunityMention[]> {
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

// --- Posição de leitura (Item 12, migration 0077) -----------------------
// Mesmo padrão de escrita direta (RLS, não RPC) de community_saved_topics
// — sem regra de negócio, só "o dono lê/escreve a própria linha".

export async function getTopicReadPosition(supabase: AnySupabaseClient, topicId: string): Promise<string | null> {
  const { data } = await supabase.from('community_topic_reads').select('last_read_post_id').eq('topic_id', topicId).maybeSingle();
  return (data as Pick<CommunityTopicRead, 'last_read_post_id'> | null)?.last_read_post_id ?? null;
}

// profileId vem explícito do chamador (mesmo padrão de saveTopic) —
// nunca lido daqui, pra este módulo continuar sem depender de sessão.
export async function saveTopicReadPosition(supabase: AnySupabaseClient, topicId: string, profileId: string, postId: string): Promise<void> {
  const { error } = await supabase
    .from('community_topic_reads')
    .upsert(
      { profile_id: profileId, topic_id: topicId, last_read_post_id: postId, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,topic_id' }
    );
  if (error) throw error;
}

// --- Status derivado (função pura, seguro duplicar em Mobile) ----------

export type CommunityContentVisibility = 'visible' | 'removed';

export function communityContentVisibility(status: CommunityContentStatus): CommunityContentVisibility {
  return status === 'published' ? 'visible' : 'removed';
}

// --- Desambiguação de @menções (função pura, seguro duplicar em Mobile) --
//
// Item @menções (08/09/2026) — auditoria confirmou que a identidade
// técnica da menção já é (e continua sendo) profile_id; o problema era
// só a apresentação visual quando dois candidatos têm o mesmo
// displayName. Nível principal: profissão + cidade, com fallback pros
// dados faltantes (nunca inventa dado, nunca expõe UUID). Terceiro
// nível (identificador público estável — profiles.slug, via
// community_profiles_public.public_id, migration 0076) só aparece
// quando dois OU MAIS candidatos, no mesmo conjunto sendo mostrado,
// ficariam visualmente idênticos (mesmo nome + mesmo subtítulo,
// incluindo o caso de nenhum dos dois ter profissão/cidade — subtítulo
// nulo colide com subtítulo nulo igual a qualquer outro valor). Nunca
// aparece pra quem não precisa.
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
