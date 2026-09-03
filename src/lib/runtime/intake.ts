import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrappers finos sobre
// resolve_or_create_external_participant/persist_inbound_message
// (migration 0051) — o caminho de intake dedicado que a RLS de
// conversation_messages (0039) sempre previu mas nunca teve.

export async function resolveOrCreateExternalParticipant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { professionalId: string; channel: string; identifier: string; name: string | null }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .rpc('resolve_or_create_external_participant', {
      p_professional_id: params.professionalId,
      p_channel: params.channel,
      p_identifier: params.identifier,
      p_name: params.name,
    })
    .single();
  if (error || !data) throw new Error(`resolve_or_create_external_participant falhou: ${error?.message ?? 'sem dado'}`);
  return data as { id: string };
}

export async function persistInboundMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    conversationId: string;
    authorType: 'external_participant' | 'professional';
    authorProfileId: string | null;
    authorExternalParticipantId: string | null;
    channel: string;
    contentType: string;
    body: string;
    // Conversas Bloco 2 (migration 0066) — ver comentário em types.ts
    // (InboundEvent.repliedToOutboundIntentId).
    repliedToOutboundIntentId?: string | null;
  }
): Promise<{ id: string; createdAt: string; repliedToOutboundIntentId: string | null; preparedResponseOutcome: 'sent' | 'edited' | null }> {
  const { data, error } = await supabase
    .rpc('persist_inbound_message', {
      p_conversation_id: params.conversationId,
      p_author_type: params.authorType,
      p_author_profile_id: params.authorProfileId,
      p_author_external_participant_id: params.authorExternalParticipantId,
      p_channel: params.channel,
      p_content_type: params.contentType,
      p_body: params.body,
      p_origin_intake_id: null,
      p_replied_to_outbound_intent_id: params.repliedToOutboundIntentId ?? null,
    })
    .single();
  if (error || !data) throw new Error(`persist_inbound_message falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as {
    id: string;
    created_at: string;
    replied_to_outbound_intent_id: string | null;
    prepared_response_outcome: 'sent' | 'edited' | null;
  };
  return {
    id: row.id,
    createdAt: row.created_at,
    repliedToOutboundIntentId: row.replied_to_outbound_intent_id,
    preparedResponseOutcome: row.prepared_response_outcome,
  };
}
