import { apiBaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { deriveConversationState } from '@/lib/conversation-state';
import type {
  ConversationMessage,
  ConversationOperationalFacts,
  ExternalParticipant,
  PendingDraft,
} from '@/types/conversation';

// Conversas Bloco 2 — camada de leitura do Mobile. Toda LEITURA aqui
// vai DIRETO no Supabase (mesmo client/sessão de sempre, supabase.ts)
// — RLS já protege cada tabela ("select own"/"select via conversation",
// migrations 0039/0051/0060), nenhum boundary novo pra ler. Só a
// ESCRITA (sendProfessionalReply, no fim deste arquivo) sai pela rota
// de API do painel web, porque precisa de service_role/Runtime, que o
// Expo não roda.
//
// Espelha src/lib/conversations/data.ts (painel web) função a função —
// mesmos nomes de campo (camelCase), mesma fonte (get_conversation_operational_facts/
// conversation_messages/outbound_intents/external_participants), mesma
// lógica de estado (conversation-state.ts). Cópia deliberada — sem
// grafo de import compartilhado entre Web e Mobile nesta base de
// código (ver comentário em conversation-state.ts).

type RawOperationalFactsRow = {
  conversation_id: string;
  conversation_type: 'external_inquiry' | 'professional_self';
  status: 'open' | 'closed' | 'archived';
  mandate: string;
  last_activity_at: string;
  related_booking_id: string | null;
  related_opportunity_id: string | null;
  external_participant_id: string | null;
  last_message_id: string | null;
  last_message_author_type: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  last_message_created_at: string | null;
  has_pending_runtime_reply: boolean;
  pending_runtime_reply_since: string | null;
  last_outbound_intent_delivery_state: string | null;
  last_outbound_intent_updated_at: string | null;
};

function mapOperationalFactsRow(row: RawOperationalFactsRow): ConversationOperationalFacts {
  return {
    conversationId: row.conversation_id,
    conversationType: row.conversation_type,
    status: row.status,
    mandate: row.mandate,
    lastActivityAt: row.last_activity_at,
    relatedBookingId: row.related_booking_id,
    relatedOpportunityId: row.related_opportunity_id,
    externalParticipantId: row.external_participant_id,
    lastMessageId: row.last_message_id,
    lastMessageAuthorType: row.last_message_author_type,
    lastMessageDirection: row.last_message_direction,
    lastMessageCreatedAt: row.last_message_created_at,
    hasPendingRuntimeReply: row.has_pending_runtime_reply,
    pendingRuntimeReplySince: row.pending_runtime_reply_since,
    lastOutboundIntentDeliveryState: row.last_outbound_intent_delivery_state,
    lastOutboundIntentUpdatedAt: row.last_outbound_intent_updated_at,
    state: deriveConversationState({
      status: row.status,
      hasPendingRuntimeReply: row.has_pending_runtime_reply,
      lastOutboundIntentDeliveryState: row.last_outbound_intent_delivery_state,
      lastMessageDirection: row.last_message_direction,
    }),
  };
}

export async function fetchConversationOperationalFacts(conversationId: string): Promise<ConversationOperationalFacts | null> {
  const { data, error } = await supabase.rpc('get_conversation_operational_facts', { p_conversation_id: conversationId }).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapOperationalFactsRow(data as RawOperationalFactsRow);
}

export async function fetchConversationsList(): Promise<ConversationOperationalFacts[]> {
  const { data, error } = await supabase.rpc('get_conversation_operational_facts');
  if (error) throw error;
  return ((data ?? []) as RawOperationalFactsRow[]).map(mapOperationalFactsRow);
}

export async function fetchConversationIdForBooking(bookingId: string, professionalId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('related_booking_id', bookingId)
    .eq('represented_professional_id', professionalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

type RawMessageRow = {
  id: string;
  direction: 'inbound' | 'outbound';
  author_type: 'external_participant' | 'professional' | 'ai' | 'system';
  author_profile_id: string | null;
  author_external_participant_id: string | null;
  channel: string;
  content_type: 'text' | 'audio' | 'attachment';
  body: string | null;
  audio_url: string | null;
  transcript: string | null;
  attachment_url: string | null;
  generated_by: 'human' | 'ai';
  created_at: string;
  replied_to_outbound_intent_id: string | null;
  prepared_response_outcome: 'sent' | 'edited' | null;
};

export async function fetchConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select(
      'id, direction, author_type, author_profile_id, author_external_participant_id, channel, content_type, body, audio_url, transcript, attachment_url, generated_by, created_at, replied_to_outbound_intent_id, prepared_response_outcome'
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RawMessageRow[]).map((row) => ({
    id: row.id,
    direction: row.direction,
    authorType: row.author_type,
    authorProfileId: row.author_profile_id,
    authorExternalParticipantId: row.author_external_participant_id,
    channel: row.channel,
    contentType: row.content_type,
    body: row.body,
    audioUrl: row.audio_url,
    transcript: row.transcript,
    attachmentUrl: row.attachment_url,
    generatedBy: row.generated_by,
    createdAt: row.created_at,
    repliedToOutboundIntentId: row.replied_to_outbound_intent_id,
    preparedResponseOutcome: row.prepared_response_outcome,
  }));
}

export async function fetchPendingDraft(conversationId: string): Promise<PendingDraft | null> {
  const { data, error } = await supabase
    .from('outbound_intents')
    .select('id, content, delivery_state, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .eq('delivery_state', 'policy_allowed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; content: string; delivery_state: string; created_at: string; updated_at: string };
  return { id: row.id, content: row.content, deliveryState: row.delivery_state, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function fetchExternalParticipant(externalParticipantId: string): Promise<ExternalParticipant | null> {
  const { data, error } = await supabase.from('external_participants').select('id, name, phone, email').eq('id', externalParticipantId).maybeSingle();
  if (error) throw error;
  return (data as ExternalParticipant | null) ?? null;
}

// Resultado simplificado pra UI mobile — não persegue byte a byte o
// RuntimeCycleOutcome completo do Runtime (src/lib/runtime/types.ts,
// campos internos como policyGateOutcome/resumptions não interessam à
// tela de reply); só o suficiente pra decidir sucesso/erro/mensagem.
// A fonte de verdade continua sendo submitProfessionalReply, do outro
// lado da rota de API — isto é só o shape que ela devolve serializado.
export type ProfessionalReplySubmitResult = { kind: string; error?: string } & Record<string, unknown>;

export async function sendProfessionalReply(params: {
  conversationId: string;
  submissionId: string;
  body: string;
  outboundIntentId?: string | null;
  accessToken: string;
}): Promise<ProfessionalReplySubmitResult> {
  const response = await fetch(`${apiBaseUrl()}/api/mobile/conversations/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      conversationId: params.conversationId,
      submissionId: params.submissionId,
      replyBody: params.body,
      outboundIntentId: params.outboundIntentId ?? null,
    }),
  });
  const result = (await response.json()) as ProfessionalReplySubmitResult;
  if (!response.ok && !result.kind) {
    throw new Error(result.error ?? `Falha ao enviar resposta (HTTP ${response.status})`);
  }
  return result;
}
