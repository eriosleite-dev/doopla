import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrappers finos sobre
// claim_inbound_event/finish_inbound_event (migration 0051). Nenhuma
// lógica além de tipar a chamada — a idempotência real é 100% SQL
// (ver testes adversariais em 0051).

export type ClaimInboundEventResult = { claimed: boolean; eventId: string; alreadyProcessed: boolean };

export async function claimInboundEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { channel: string; providerEventId: string; providerMessageId: string | null; leaseSeconds?: number }
): Promise<ClaimInboundEventResult> {
  const { data, error } = await supabase
    .rpc('claim_inbound_event', {
      p_channel: params.channel,
      p_provider_event_id: params.providerEventId,
      p_provider_message_id: params.providerMessageId,
      p_lease_seconds: params.leaseSeconds ?? 300,
    })
    .single();
  if (error || !data) throw new Error(`claim_inbound_event falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { claimed: boolean; event_id: string; already_processed: boolean };
  return { claimed: row.claimed, eventId: row.event_id, alreadyProcessed: row.already_processed };
}

export async function finishInboundEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { eventId: string; status: 'processed' | 'failed'; conversationMessageId: string | null; error: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('finish_inbound_event', {
    p_event_id: params.eventId,
    p_status: params.status,
    p_conversation_message_id: params.conversationMessageId,
    p_error: params.error,
  });
  if (error) throw new Error(`finish_inbound_event falhou: ${error.message}`);
}
