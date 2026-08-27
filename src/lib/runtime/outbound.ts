import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrappers finos sobre
// outbound_intents (migration 0051).
//
// createOutboundIntent é o único destes chamado pelo pipeline
// (pipeline.ts) nesta rodada — é o teto do que o Runtime automatiza
// (ver comentário em types.ts sobre requiresProfessionalReviewBeforeSend).
// claimOutboundIntentForSend/markOutboundIntent* ficam prontos e
// testados (ver testes adversariais SQL da migration 0051), mas sem
// nenhum chamador real ainda — reservados pra um worker de envio de
// canal futuro, fora de escopo aqui (nenhum WhatsApp/Meta/Resend
// nesta rodada).

export async function createOutboundIntent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    conversationId: string;
    triggerMessageId: string | null;
    runId: string | null;
    policyDecisionId: string | null;
    channel: string;
    recipientExternalParticipantId: string;
    content: string;
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .rpc('create_outbound_intent', {
      p_conversation_id: params.conversationId,
      p_trigger_message_id: params.triggerMessageId,
      p_run_id: params.runId,
      p_policy_decision_id: params.policyDecisionId,
      p_channel: params.channel,
      p_recipient_external_participant_id: params.recipientExternalParticipantId,
      p_content: params.content,
    })
    .single();
  if (error || !data) throw new Error(`create_outbound_intent falhou: ${error?.message ?? 'sem dado'}`);
  return data as { id: string };
}

export async function claimOutboundIntentForSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { outboundIntentId: string; workerId: string; leaseSeconds?: number }
): Promise<{ granted: boolean; sendAttemptId: string | null }> {
  const { data, error } = await supabase
    .rpc('claim_outbound_intent_for_send', {
      p_outbound_intent_id: params.outboundIntentId,
      p_worker_id: params.workerId,
      p_lease_seconds: params.leaseSeconds ?? 60,
    })
    .single();
  if (error || !data) throw new Error(`claim_outbound_intent_for_send falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { granted: boolean; send_attempt_id: string | null };
  return { granted: row.granted, sendAttemptId: row.send_attempt_id };
}

export async function markOutboundIntentSentConfirmed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { outboundIntentId: string; sendAttemptId: string; providerMessageId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_outbound_intent_sent_confirmed', {
    p_outbound_intent_id: params.outboundIntentId,
    p_send_attempt_id: params.sendAttemptId,
    p_provider_message_id: params.providerMessageId,
  });
  if (error) throw new Error(`mark_outbound_intent_sent_confirmed falhou: ${error.message}`);
  return data === true;
}

export async function markOutboundIntentSendUnknown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { outboundIntentId: string; sendAttemptId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_outbound_intent_send_unknown', {
    p_outbound_intent_id: params.outboundIntentId,
    p_send_attempt_id: params.sendAttemptId,
  });
  if (error) throw new Error(`mark_outbound_intent_send_unknown falhou: ${error.message}`);
  return data === true;
}

export async function markOutboundIntentFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { outboundIntentId: string; sendAttemptId: string; permanent: boolean; reason: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_outbound_intent_failed', {
    p_outbound_intent_id: params.outboundIntentId,
    p_send_attempt_id: params.sendAttemptId,
    p_permanent: params.permanent,
    p_reason: params.reason,
  });
  if (error) throw new Error(`mark_outbound_intent_failed falhou: ${error.message}`);
  return data === true;
}

export async function cancelOutboundIntent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { outboundIntentId: string; reason: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_outbound_intent', {
    p_outbound_intent_id: params.outboundIntentId,
    p_reason: params.reason,
  });
  if (error) throw new Error(`cancel_outbound_intent falhou: ${error.message}`);
  return data === true;
}
