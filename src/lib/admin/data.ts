import type { createClient } from '@/lib/supabase/server';
import type {
  AdminAiCostUsageRow,
  AdminAuditEventRow,
  AdminBetaPulse,
  AdminCommunityContentRow,
  AdminProfileDetail,
  AdminProfileSearchRow,
  CommunityVisibilityStatus,
} from '@/lib/supabase/types';

// Painel Admin V1 (migration 0096) — thin wrappers sobre as RPCs
// admin_*. Nenhuma lógica de autoridade aqui: cada RPC já verifica
// auth.uid()+profiles.is_admin internamente (_assert_is_admin, nunca
// grantada a authenticated/anon) — este arquivo só tipa o retorno e
// propaga erro, nunca decide quem pode chamar o quê.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function searchAdminProfiles(
  supabase: SupabaseServerClient,
  query: string | null,
  limit = 50
): Promise<AdminProfileSearchRow[]> {
  const { data, error } = await supabase.rpc('admin_search_profiles', { p_query: query, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminProfileDetail(supabase: SupabaseServerClient, profileId: string): Promise<AdminProfileDetail | null> {
  const { data, error } = await supabase.rpc('admin_get_profile_detail', { p_profile_id: profileId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function searchAdminCommunityContent(
  supabase: SupabaseServerClient,
  query: string | null,
  limit = 30
): Promise<AdminCommunityContentRow[]> {
  const { data, error } = await supabase.rpc('admin_search_community_content', { p_query: query, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminAiCostSummary(supabase: SupabaseServerClient, since?: string): Promise<AdminAiCostUsageRow[]> {
  const { data, error } = await supabase.rpc('admin_get_ai_cost_summary', since ? { p_since: since } : {});
  if (error) throw error;
  return data ?? [];
}

export async function getAdminBetaPulse(supabase: SupabaseServerClient): Promise<AdminBetaPulse | null> {
  const { data, error } = await supabase.rpc('admin_get_beta_pulse');
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listAdminAuditEvents(supabase: SupabaseServerClient, limit = 50): Promise<AdminAuditEventRow[]> {
  const { data, error } = await supabase.rpc('admin_list_audit_events', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

export type AdminModerationActionResult = { ok: true } | { ok: false; error: string };

export async function setAdminCommunityVisibility(
  supabase: SupabaseServerClient,
  params: { profileId: string; status: CommunityVisibilityStatus; reason: string }
): Promise<AdminModerationActionResult> {
  const { error } = await supabase.rpc('admin_set_community_visibility', {
    p_profile_id: params.profileId,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeAdminCommunityTopic(
  supabase: SupabaseServerClient,
  params: { topicId: string; reason: string }
): Promise<AdminModerationActionResult> {
  const { error } = await supabase.rpc('admin_remove_community_topic', { p_topic_id: params.topicId, p_reason: params.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreAdminCommunityTopic(
  supabase: SupabaseServerClient,
  params: { topicId: string; reason: string }
): Promise<AdminModerationActionResult> {
  const { error } = await supabase.rpc('admin_restore_community_topic', { p_topic_id: params.topicId, p_reason: params.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeAdminCommunityPost(
  supabase: SupabaseServerClient,
  params: { postId: string; reason: string }
): Promise<AdminModerationActionResult> {
  const { error } = await supabase.rpc('admin_remove_community_post', { p_post_id: params.postId, p_reason: params.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreAdminCommunityPost(
  supabase: SupabaseServerClient,
  params: { postId: string; reason: string }
): Promise<AdminModerationActionResult> {
  const { error } = await supabase.rpc('admin_restore_community_post', { p_post_id: params.postId, p_reason: params.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
