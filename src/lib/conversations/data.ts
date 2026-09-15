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
  // Bookings unificado (0081) — origem/canal da conversa
  // ('whatsapp' | 'public_link' | 'email' | 'painel' | 'outro'),
  // exposta pra lista de Bookings mostrar o canal sem consulta extra.
  channel: string;
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
  channel: string;
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
    channel: row.channel,
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

// Fatos operacionais da conversa ligada a UM pedido (opportunity)
// específico — usado pelo detalhe de Pedido e por buildWorkItems
// (work-items.ts) pra derivar "precisa de você" real, nunca a partir
// de opportunities.status sozinho (correção 15/09/2026, achado da
// fundadora). Mais recente quando houver mais de uma; null quando o
// pedido ainda não tem conversation nenhuma (hoje o caso comum — ver
// PROGRESS.md, gap de submit_orcamento_request/create_conversation).
export async function getConversationOperationalFactsForOpportunity(
  supabase: AnySupabaseClient,
  opportunityId: string
): Promise<ConversationOperationalFacts | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('related_opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!data) return null;
  return getConversationOperationalFacts(supabase, data.id);
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

// Mapeia a conversation mais recente por `related_booking_id` OU
// `related_opportunity_id` — uma passada só, reaproveitada por
// buildWorkItems (work-items.ts) e pela Home (professional-home-view.tsx)
// pra nunca duplicar essa lógica de "mais recente por id relacionado"
// (correção 15/09/2026, unificação de "precisa de você").
export function latestConversationByRelatedId(
  facts: ConversationOperationalFacts[],
  key: 'relatedBookingId' | 'relatedOpportunityId'
): Map<string, ConversationOperationalFacts> {
  const byId = new Map<string, ConversationOperationalFacts>();
  for (const fact of facts) {
    const relatedId = fact[key];
    if (!relatedId) continue;
    const existing = byId.get(relatedId);
    if (!existing || fact.lastActivityAt > existing.lastActivityAt) byId.set(relatedId, fact);
  }
  return byId;
}

// Bookings (revisão Professional Web Dashboard, 06/09/2026) — "Ver
// conversa" precisa do conversationId de CADA booking da lista, uma
// consulta só (nunca N chamadas de getConversationIdForBooking). Mesma
// conversa mais recente por booking, mesmo critério.
export function mapConversationIdsByBookingId(facts: ConversationOperationalFacts[]): Record<string, string> {
  const byBooking = new Map<string, ConversationOperationalFacts>();
  for (const fact of facts) {
    if (!fact.relatedBookingId) continue;
    const existing = byBooking.get(fact.relatedBookingId);
    if (!existing || fact.lastActivityAt > existing.lastActivityAt) {
      byBooking.set(fact.relatedBookingId, fact);
    }
  }
  const result: Record<string, string> = {};
  for (const [bookingId, fact] of byBooking) result[bookingId] = fact.conversationId;
  return result;
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

// Correção de UX de Decisões (06/09/2026) — versão em lote de
// getExternalParticipant, pra resolver nome real de cliente em
// conversas SEM booking associado (onde não dá pra pegar o nome via
// getUserBookings/otherPartyName). Mesma tabela/RLS, só evita 1 round
// trip por decisão.
export async function getExternalParticipants(supabase: AnySupabaseClient, ids: string[]): Promise<Map<string, ExternalParticipant>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from('external_participants').select('id, name, phone, email').in('id', [...new Set(ids)]);
  return new Map(((data ?? []) as ExternalParticipant[]).map((p) => [p.id, p]));
}
