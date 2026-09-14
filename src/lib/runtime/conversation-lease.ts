import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrappers finos sobre
// acquire_conversation_processing_lease/release_conversation_processing_lease
// (migration 0051). Serializa processamento por conversation — nunca
// um lock global.

export type AcquireLeaseResult = { granted: boolean; leaseToken: string | null; leaseExpiresAt: string | null };

export async function acquireConversationLease(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; workerId: string; leaseSeconds?: number }
): Promise<AcquireLeaseResult> {
  const { data, error } = await supabase
    .rpc('acquire_conversation_processing_lease', {
      p_conversation_id: params.conversationId,
      p_worker_id: params.workerId,
      p_lease_seconds: params.leaseSeconds ?? 120,
    })
    .single();
  if (error || !data) throw new Error(`acquire_conversation_processing_lease falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { granted: boolean; lease_token: string | null; lease_expires_at: string | null };
  return { granted: row.granted, leaseToken: row.lease_token, leaseExpiresAt: row.lease_expires_at };
}

export async function releaseConversationLease(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; leaseToken: string }
): Promise<void> {
  const { error } = await supabase.rpc('release_conversation_processing_lease', {
    p_conversation_id: params.conversationId,
    p_lease_token: params.leaseToken,
  });
  if (error) throw new Error(`release_conversation_processing_lease falhou: ${error.message}`);
}
