'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import {
  removeAdminCommunityPost,
  removeAdminCommunityTopic,
  restoreAdminCommunityPost,
  restoreAdminCommunityTopic,
  setAdminCommunityVisibility,
} from '@/lib/admin/data';
import type { CommunityVisibilityStatus } from '@/lib/supabase/types';

// Painel Admin V1 — Server Actions finas sobre as RPCs admin_*. Nunca
// usam createServiceRoleClient(): o mesmo client cookie-scoped de
// sempre é suficiente, porque a autoridade real está dentro de cada
// RPC (_assert_is_admin), não no tipo de client usado aqui. "reason"
// obrigatório é reforçado de novo no banco (a RPC recusa string vazia)
// — esta camada só evita um round-trip óbvio.
function backTo(query: string, status: 'ok' | 'error', message?: string): never {
  const params = new URLSearchParams(query);
  params.set('status', status);
  if (message) params.set('message', message);
  redirect(`/admin/comunidade?${params.toString()}`);
}

export async function moderateSetVisibilityAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const query = String(formData.get('query') ?? '');
  const profileId = String(formData.get('profile_id') ?? '');
  const status = String(formData.get('status') ?? '') as CommunityVisibilityStatus;
  const reason = String(formData.get('reason') ?? '');

  const result = await setAdminCommunityVisibility(supabase, { profileId, status, reason });
  if (!result.ok) backTo(query, 'error', result.error);
  backTo(query, 'ok');
}

export async function moderateRemoveTopicAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const query = String(formData.get('query') ?? '');
  const topicId = String(formData.get('topic_id') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await removeAdminCommunityTopic(supabase, { topicId, reason });
  if (!result.ok) backTo(query, 'error', result.error);
  backTo(query, 'ok');
}

export async function moderateRestoreTopicAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const query = String(formData.get('query') ?? '');
  const topicId = String(formData.get('topic_id') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await restoreAdminCommunityTopic(supabase, { topicId, reason });
  if (!result.ok) backTo(query, 'error', result.error);
  backTo(query, 'ok');
}

export async function moderateRemovePostAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const query = String(formData.get('query') ?? '');
  const postId = String(formData.get('post_id') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await removeAdminCommunityPost(supabase, { postId, reason });
  if (!result.ok) backTo(query, 'error', result.error);
  backTo(query, 'ok');
}

export async function moderateRestorePostAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const query = String(formData.get('query') ?? '');
  const postId = String(formData.get('post_id') ?? '');
  const reason = String(formData.get('reason') ?? '');

  const result = await restoreAdminCommunityPost(supabase, { postId, reason });
  if (!result.ok) backTo(query, 'error', result.error);
  backTo(query, 'ok');
}
