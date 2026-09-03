import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveConversationState, type ConversationState } from './state';

// Doopla Intelligence OS v1 — Conversas Bloco 2: camada de leitura do
// painel web. Cada função aqui recebe um client JÁ autenticado (RLS
// sujeita ao usuário real) e só filtra/mapeia — nenhum ownership novo
// reimplementado, sempre reaproveitando as policies "select own" já
// testadas adversarialmente nas respectivas migrations (conversations,
// conversation_messages, outbound_intents — 0039/0051; RPC
// get_conversation_operational_facts — 0060, SECURITY INVOKER).
//
// Deliberadamente NUNCA lido pela lista/estado: outbound_intents.
// content só entra aqui via getPendingDraftForConversation, chamado
// pela tela de DETALHE — a lista (Bloco 1) nunca precisa do conteúdo
// do rascunho, só do delivery_state (get_conversation_operational_facts
// já expõe isso, de propósito, sem o content).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type ConversationOperationalFacts = {
  conversationId: string;
  conversationType: 'external_inquiry' | 'professional_self';
  status: 'open' | 'closed' | 'archived';
  mandate: string;
  lastActivityAt: string;
  relatedBookingId: string | null;
  relatedOpportunityId: string | null;
  externalParticipantId: string | null;
  lastMessageId: string | null;
  lastMessageAuthorType: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  lastMessageCreatedAt: string | null;
  hasPendingRuntimeReply: boolean;
  pendingRuntimeReplySince: string | null;
  lastOutboundIntentDeliveryState: string | null;
  lastOutboundIntentUpdatedAt: string | null;
  state: ConversationState;
};

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

// Uma conversa específica — retorna null tanto pra "não existe" quanto
// pra "existe mas não é do chamador" (RLS nega em silêncio, mesmo
// comportamento de um SELECT direto negado — nunca um erro distinto
// que vazasse existência).
export async function getConversationOperationalFacts(
  supabase: AnySupabaseClient,
  conversationId: string
): Promise<ConversationOperationalFacts | null> {
  const { data, error } = await supabase.rpc('get_conversation_operational_facts', { p_conversation_id: conversationId }).maybeSingle();
  if (error || !data) return null;
  return mapOperationalFactsRow(data as RawOperationalFactsRow);
}

// Todas as conversas visíveis ao chamador sob RLS — usado pela LISTA.
export async function listConversationOperationalFacts(supabase: AnySupabaseClient): Promise<ConversationOperationalFacts[]> {
  const { data, error } = await supabase.rpc('get_conversation_operational_facts');
  if (error || !data) return [];
  return (data as RawOperationalFactsRow[]).map(mapOperationalFactsRow);
}

// Resolve qual conversation corresponde ao "Ver conversa" de um
// booking específico — mais recente quando houver mais de uma (nunca
// deveria, mas nunca assume unicidade só por convenção).
export async function getConversationIdForBooking(supabase: AnySupabaseClient, bookingId: string, professionalId: string): Promise<string | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('related_booking_id', bookingId)
    .eq('represented_professional_id', professionalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export type ConversationMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  authorType: 'external_participant' | 'professional' | 'ai' | 'system';
  authorProfileId: string | null;
  authorExternalParticipantId: string | null;
  channel: string;
  contentType: 'text' | 'audio' | 'attachment';
  body: string | null;
  audioUrl: string | null;
  transcript: string | null;
  attachmentUrl: string | null;
  generatedBy: 'human' | 'ai';
  createdAt: string;
  // Conversas Bloco 2 (migration 0066) — proveniência factual, não
  // interpretação. Ver comentário em runtime/types.ts.
  repliedToOutboundIntentId: string | null;
  preparedResponseOutcome: 'sent' | 'edited' | null;
};

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

// Thread completo — a tela de DETALHE lê direto da tabela (RLS
// "conversation_messages: select via conversation", 0039), nunca por
// get_conversation_operational_facts (que de propósito só expõe a
// ÚLTIMA mensagem, pra lista).
export async function getConversationMessages(supabase: AnySupabaseClient, conversationId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select(
      'id, direction, author_type, author_profile_id, author_external_participant_id, channel, content_type, body, audio_url, transcript, attachment_url, generated_by, created_at, replied_to_outbound_intent_id, prepared_response_outcome'
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as RawMessageRow[]).map((row) => ({
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

export type PendingDraft = {
  id: string;
  content: string;
  deliveryState: string;
  createdAt: string;
  updatedAt: string;
};

// O draft ATUAL (delivery_state='policy_allowed') pendente de ação do
// profissional pra esta conversa, quando existir — nunca exposto pela
// lista/get_conversation_operational_facts, só aqui, pela tela de
// DETALHE (RLS "outbound_intents: select own", 0051).
export async function getPendingDraftForConversation(supabase: AnySupabaseClient, conversationId: string): Promise<PendingDraft | null> {
  const { data } = await supabase
    .from('outbound_intents')
    .select('id, content, delivery_state, created_at, updated_at')
    .eq('conversation_id', conversationId)
    .eq('delivery_state', 'policy_allowed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; content: string; delivery_state: string; created_at: string; updated_at: string };
  return { id: row.id, content: row.content, deliveryState: row.delivery_state, createdAt: row.created_at, updatedAt: row.updated_at };
}

export type ExternalParticipant = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

// Nome/contato do cliente externo — lido direto (RLS "external_participants:
// select own", 0039), nunca por get_conversation_operational_facts
// (que de propósito só expõe o id).
export async function getExternalParticipant(supabase: AnySupabaseClient, externalParticipantId: string): Promise<ExternalParticipant | null> {
  const { data } = await supabase.from('external_participants').select('id, name, phone, email').eq('id', externalParticipantId).maybeSingle();
  return (data as ExternalParticipant | null) ?? null;
}
