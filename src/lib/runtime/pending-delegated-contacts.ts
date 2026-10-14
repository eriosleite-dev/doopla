import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: "Doopla chama o cliente",
// Etapa 1 (produto, 13/10/2026). Wrappers finos sobre
// pending_delegated_contacts (migration 0104) — peça ISOLADA, nunca
// reaproveita/altera approval_records/runtime_pending_replies (ver
// comentário da migration pro porquê: aquela máquina pressupõe um
// commercial_root já existente, este fluxo cobre o estado ANTES de
// qualquer conversa/negociação com o destinatário existir).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type PendingDelegatedContactStatus =
  | 'pending_number'
  | 'pending_approval'
  | 'approved'
  // Etapa 2.1 (migration 0109) — transitório entre approved e
  // executed, claim de execução do TEMPLATE em andamento.
  | 'executing'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  // Etapa 2.1 — terminal: template enviado, destinatário nunca
  // respondeu dentro de no_reply_deadline_at.
  | 'expired_no_reply'
  | 'executed'
  | 'failed';

// Etapa 2.1 (migration 0109) — máquina de estados independente de
// status, só pro TEXTO LITERAL. Ver comentário da coluna na migration.
export type LiteralContentGate =
  | 'not_applicable'
  | 'awaiting_recipient_reply'
  | 'awaiting_recipient_review'
  | 'approved_to_send'
  | 'declined_by_recipient'
  | 'sending'
  | 'sent'
  | 'failed';

export type PendingDelegatedContact = {
  id: string;
  requestingProfessionalId: string;
  conversationId: string;
  triggerMessageId: string;
  recipientName: string | null;
  recipientNumber: string | null;
  purposeSummary: string;
  draftMessageContent: string | null;
  confirmationMessageId: string | null;
  decisionMessageId: string | null;
  status: PendingDelegatedContactStatus;
  createdConversationId: string | null;
  createdOutboundIntentId: string | null;
  expiresAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  // Etapa 2.1.
  noReplyDeadlineAt: string | null;
  literalContentGate: LiteralContentGate;
  recipientFirstReplyMessageId: string | null;
  literalContentConfirmationMessageId: string | null;
  literalContentDecisionMessageId: string | null;
  literalContentOutboundIntentId: string | null;
};

type RawRow = {
  id: string;
  requesting_professional_id: string;
  conversation_id: string;
  trigger_message_id: string;
  recipient_name: string | null;
  recipient_number: string | null;
  purpose_summary: string;
  draft_message_content: string | null;
  confirmation_message_id: string | null;
  decision_message_id: string | null;
  status: PendingDelegatedContactStatus;
  created_conversation_id: string | null;
  created_outbound_intent_id: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
  no_reply_deadline_at?: string | null;
  literal_content_gate?: LiteralContentGate;
  recipient_first_reply_message_id?: string | null;
  literal_content_confirmation_message_id?: string | null;
  literal_content_decision_message_id?: string | null;
  literal_content_outbound_intent_id?: string | null;
};

function mapRow(row: RawRow): PendingDelegatedContact {
  return {
    id: row.id,
    requestingProfessionalId: row.requesting_professional_id,
    conversationId: row.conversation_id,
    triggerMessageId: row.trigger_message_id,
    recipientName: row.recipient_name,
    recipientNumber: row.recipient_number,
    purposeSummary: row.purpose_summary,
    draftMessageContent: row.draft_message_content,
    confirmationMessageId: row.confirmation_message_id,
    decisionMessageId: row.decision_message_id,
    status: row.status,
    createdConversationId: row.created_conversation_id,
    createdOutboundIntentId: row.created_outbound_intent_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    noReplyDeadlineAt: row.no_reply_deadline_at ?? null,
    literalContentGate: row.literal_content_gate ?? 'not_applicable',
    recipientFirstReplyMessageId: row.recipient_first_reply_message_id ?? null,
    literalContentConfirmationMessageId: row.literal_content_confirmation_message_id ?? null,
    literalContentDecisionMessageId: row.literal_content_decision_message_id ?? null,
    literalContentOutboundIntentId: row.literal_content_outbound_intent_id ?? null,
  };
}

export async function createPendingDelegatedContact(
  supabase: AnySupabaseClient,
  params: {
    requestingProfessionalId: string;
    conversationId: string;
    triggerMessageId: string;
    purposeSummary: string;
    recipientName?: string | null;
    recipientNumber?: string | null;
  }
): Promise<PendingDelegatedContact> {
  const { data, error } = await supabase
    .rpc('create_pending_delegated_contact', {
      p_requesting_professional_id: params.requestingProfessionalId,
      p_conversation_id: params.conversationId,
      p_trigger_message_id: params.triggerMessageId,
      p_purpose_summary: params.purposeSummary,
      p_recipient_name: params.recipientName ?? null,
      p_recipient_number: params.recipientNumber ?? null,
    })
    .single();
  if (error || !data) throw new Error(`create_pending_delegated_contact falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Etapa 2.1 — guarda informação parcial (número e/ou texto do pedido)
// chegando em turnos separados, sem avançar pra pending_approval (isso
// só acontece em preparePendingDelegatedContactApproval, quando os
// dois já existem).
export async function updatePendingDelegatedContactPendingInfo(
  supabase: AnySupabaseClient,
  params: { id: string; recipientName?: string | null; recipientNumber?: string | null; draftMessageContent?: string | null; purposeSummary?: string | null }
): Promise<PendingDelegatedContact> {
  const { data, error } = await supabase
    .rpc('update_pending_delegated_contact_pending_info', {
      p_id: params.id,
      p_recipient_name: params.recipientName ?? null,
      p_recipient_number: params.recipientNumber ?? null,
      p_draft_message_content: params.draftMessageContent ?? null,
      p_purpose_summary: params.purposeSummary ?? null,
    })
    .single();
  if (error || !data) throw new Error(`update_pending_delegated_contact_pending_info falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

export async function preparePendingDelegatedContactApproval(
  supabase: AnySupabaseClient,
  params: { id: string; recipientNumber: string; draftMessageContent: string; confirmationMessageId: string; expiresInHours?: number }
): Promise<PendingDelegatedContact> {
  const { data, error } = await supabase
    .rpc('prepare_pending_delegated_contact_approval', {
      p_id: params.id,
      p_recipient_number: params.recipientNumber,
      p_draft_message_content: params.draftMessageContent,
      p_confirmation_message_id: params.confirmationMessageId,
      p_expires_in_hours: params.expiresInHours ?? 24,
    })
    .single();
  if (error || !data) throw new Error(`prepare_pending_delegated_contact_approval falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

export type ClaimPendingDelegatedContactDecisionResult =
  | { granted: false }
  | { granted: true; conversationId: string; requestingProfessionalId: string; recipientNumber: string; draftMessageContent: string };

export async function claimPendingDelegatedContactDecision(
  supabase: AnySupabaseClient,
  params: { id: string; expectedConfirmationMessageId: string; decisionMessageId: string; approved: boolean }
): Promise<ClaimPendingDelegatedContactDecisionResult> {
  const { data, error } = await supabase
    .rpc('claim_pending_delegated_contact_decision', {
      p_id: params.id,
      p_expected_confirmation_message_id: params.expectedConfirmationMessageId,
      p_decision_message_id: params.decisionMessageId,
      p_approved: params.approved,
    })
    .single();
  if (error || !data) throw new Error(`claim_pending_delegated_contact_decision falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as {
    granted: boolean;
    conversation_id: string | null;
    requesting_professional_id: string | null;
    recipient_number: string | null;
    draft_message_content: string | null;
  };
  if (!row.granted) return { granted: false };
  return {
    granted: true,
    conversationId: row.conversation_id!,
    requestingProfessionalId: row.requesting_professional_id!,
    recipientNumber: row.recipient_number!,
    draftMessageContent: row.draft_message_content!,
  };
}

export async function cancelPendingDelegatedContact(
  supabase: AnySupabaseClient,
  params: { id: string; decisionMessageId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_pending_delegated_contact', {
    p_id: params.id,
    p_decision_message_id: params.decisionMessageId,
  });
  if (error) throw new Error(`cancel_pending_delegated_contact falhou: ${error.message}`);
  return data === true;
}

export async function expireStalePendingDelegatedContacts(supabase: AnySupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc('expire_stale_pending_delegated_contacts');
  if (error) throw new Error(`expire_stale_pending_delegated_contacts falhou: ${error.message}`);
  return ((data ?? []) as Array<{ id: string } | string>).map((row) => (typeof row === 'string' ? row : row.id));
}

// ============================================================
// Etapa 2.1 (migration 0109) — execução real. Duas máquinas de estado
// independentes (template x texto literal), cada uma com seu próprio
// claim/lease/mark — ver comentário da migration pro porquê.
// ============================================================

export type ClaimPendingDelegatedContactForExecutionResult =
  | { granted: false }
  | { granted: true; requestingProfessionalId: string; conversationId: string; recipientNumber: string; recipientName: string | null; draftMessageContent: string | null };

export async function claimPendingDelegatedContactForTemplateExecution(
  supabase: AnySupabaseClient,
  params: { id: string; workerId: string; leaseSeconds?: number }
): Promise<ClaimPendingDelegatedContactForExecutionResult> {
  const { data, error } = await supabase
    .rpc('claim_pending_delegated_contact_for_template_execution', {
      p_id: params.id,
      p_worker_id: params.workerId,
      p_lease_seconds: params.leaseSeconds ?? 60,
    })
    .single();
  if (error || !data) throw new Error(`claim_pending_delegated_contact_for_template_execution falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as {
    granted: boolean;
    requesting_professional_id: string | null;
    conversation_id: string | null;
    recipient_number: string | null;
    recipient_name: string | null;
    draft_message_content: string | null;
  };
  if (!row.granted) return { granted: false };
  return {
    granted: true,
    requestingProfessionalId: row.requesting_professional_id!,
    conversationId: row.conversation_id!,
    recipientNumber: row.recipient_number!,
    recipientName: row.recipient_name,
    draftMessageContent: row.draft_message_content,
  };
}

// Equivalente de create_conversation (ramo por profissional+participante)
// pra chamador service_role — ver comentário da function na migration
// 0109 pro porquê de create_conversation (auth.uid()) não servir aqui.
export async function createDelegatedContactConversation(
  supabase: AnySupabaseClient,
  params: { professionalId: string; externalParticipantId: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .rpc('create_delegated_contact_conversation', {
      p_professional_id: params.professionalId,
      p_external_participant_id: params.externalParticipantId,
    })
    .single();
  if (error || !data) throw new Error(`create_delegated_contact_conversation falhou: ${error?.message ?? 'sem dado'}`);
  return { id: (data as { id: string }).id };
}

export type RecipientReplyOutcome = 'proceed' | 'declined' | 'ambiguous';

// Registra a 1ª resposta real do destinatário + o resultado (já
// decidido em código, pelo recipient-consent-check isolado — esta
// function só persiste). Guardado por literal_content_gate no banco:
// devolve false em qualquer repetição, nunca reprocessa.
export async function setPendingDelegatedContactRecipientReply(
  supabase: AnySupabaseClient,
  params: { id: string; messageId: string; outcome: RecipientReplyOutcome }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_pending_delegated_contact_recipient_reply', {
    p_id: params.id,
    p_message_id: params.messageId,
    p_outcome: params.outcome,
  });
  if (error) throw new Error(`set_pending_delegated_contact_recipient_reply falhou: ${error.message}`);
  return data === true;
}

export async function preparePendingDelegatedContactLiteralContentReview(
  supabase: AnySupabaseClient,
  params: { id: string; confirmationMessageId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('prepare_pending_delegated_contact_literal_content_review', {
    p_id: params.id,
    p_confirmation_message_id: params.confirmationMessageId,
  });
  if (error) throw new Error(`prepare_pending_delegated_contact_literal_content_review falhou: ${error.message}`);
  return data === true;
}

export type ClaimPendingDelegatedContactLiteralContentDecisionResult =
  | { granted: false }
  | { granted: true; requestingProfessionalId: string; conversationId: string; recipientNumber: string; draftMessageContent: string };

// Mesmo padrão de claimPendingDelegatedContactDecision (gate original)
// — exige o confirmation_message_id EXATO do segundo gate, campos
// inteiramente separados, nunca confundível com uma decisão do
// primeiro gate (já resolvido muito antes neste ponto do fluxo).
export async function claimPendingDelegatedContactLiteralContentDecision(
  supabase: AnySupabaseClient,
  params: { id: string; expectedConfirmationMessageId: string; decisionMessageId: string; approved: boolean }
): Promise<ClaimPendingDelegatedContactLiteralContentDecisionResult> {
  const { data, error } = await supabase
    .rpc('claim_pending_delegated_contact_literal_content_decision', {
      p_id: params.id,
      p_expected_confirmation_message_id: params.expectedConfirmationMessageId,
      p_decision_message_id: params.decisionMessageId,
      p_approved: params.approved,
    })
    .single();
  if (error || !data) throw new Error(`claim_pending_delegated_contact_literal_content_decision falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as {
    granted: boolean;
    requesting_professional_id: string | null;
    conversation_id: string | null;
    recipient_number: string | null;
    draft_message_content: string | null;
  };
  if (!row.granted) return { granted: false };
  return {
    granted: true,
    requestingProfessionalId: row.requesting_professional_id!,
    conversationId: row.conversation_id!,
    recipientNumber: row.recipient_number!,
    draftMessageContent: row.draft_message_content!,
  };
}

export type ClaimPendingDelegatedContactForLiteralContentSendResult =
  | { granted: false }
  | { granted: true; requestingProfessionalId: string; conversationId: string; professionalSelfConversationId: string; recipientNumber: string; draftMessageContent: string };

export async function claimPendingDelegatedContactForLiteralContentSend(
  supabase: AnySupabaseClient,
  params: { id: string; workerId: string; leaseSeconds?: number }
): Promise<ClaimPendingDelegatedContactForLiteralContentSendResult> {
  const { data, error } = await supabase
    .rpc('claim_pending_delegated_contact_for_literal_content_send', {
      p_id: params.id,
      p_worker_id: params.workerId,
      p_lease_seconds: params.leaseSeconds ?? 60,
    })
    .single();
  if (error || !data) throw new Error(`claim_pending_delegated_contact_for_literal_content_send falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as {
    granted: boolean;
    requesting_professional_id: string | null;
    conversation_id: string | null;
    professional_self_conversation_id: string | null;
    recipient_number: string | null;
    draft_message_content: string | null;
  };
  if (!row.granted) return { granted: false };
  return {
    granted: true,
    requestingProfessionalId: row.requesting_professional_id!,
    conversationId: row.conversation_id!,
    professionalSelfConversationId: row.professional_self_conversation_id!,
    recipientNumber: row.recipient_number!,
    draftMessageContent: row.draft_message_content!,
  };
}

export async function markPendingDelegatedContactLiteralContentSent(
  supabase: AnySupabaseClient,
  params: { id: string; outboundIntentId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_literal_content_sent', {
    p_id: params.id,
    p_outbound_intent_id: params.outboundIntentId,
  });
  if (error) throw new Error(`mark_pending_delegated_contact_literal_content_sent falhou: ${error.message}`);
  return data === true;
}

export async function markPendingDelegatedContactLiteralContentFailed(supabase: AnySupabaseClient, params: { id: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_literal_content_failed', { p_id: params.id });
  if (error) throw new Error(`mark_pending_delegated_contact_literal_content_failed falhou: ${error.message}`);
  return data === true;
}

// Devolve a linha completa quando a transição aconteceu (nunca só um
// booleano) — o sweep do cron precisa de requestingProfessionalId/
// conversationId/recipientName pra avisar a profissional sem uma 2ª
// leitura. null quando a linha não estava mais elegível (idempotência:
// 2ª passada do sweep sobre o mesmo id nunca reprocessa).
export async function markPendingDelegatedContactExpiredNoReply(supabase: AnySupabaseClient, params: { id: string }): Promise<PendingDelegatedContact | null> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_expired_no_reply', { p_id: params.id });
  if (error) throw new Error(`mark_pending_delegated_contact_expired_no_reply falhou: ${error.message}`);
  if (!data) return null;
  return mapRow(data as RawRow);
}

async function listIds(supabase: AnySupabaseClient, fn: string, limit: number): Promise<string[]> {
  const { data, error } = await supabase.rpc(fn, { p_limit: limit });
  if (error) throw new Error(`${fn} falhou: ${error.message}`);
  return ((data ?? []) as Array<{ id: string } | string>).map((row) => (typeof row === 'string' ? row : row.id));
}

// Sweeps do cron (drain-professional-self-messages/route.ts) — sempre
// via RPC, mesmo padrão de listClaimableOutboundIntents.
export function listPendingDelegatedContactsDueForNoReplyExpiry(supabase: AnySupabaseClient, params: { limit?: number } = {}): Promise<string[]> {
  return listIds(supabase, 'list_pending_delegated_contacts_due_for_no_reply_expiry', params.limit ?? 50);
}

export function listPendingDelegatedContactsWithExpiredExecutionLease(supabase: AnySupabaseClient, params: { limit?: number } = {}): Promise<string[]> {
  return listIds(supabase, 'list_pending_delegated_contacts_with_expired_execution_lease', params.limit ?? 50);
}

export function listPendingDelegatedContactsWithExpiredLiteralContentLease(supabase: AnySupabaseClient, params: { limit?: number } = {}): Promise<string[]> {
  return listIds(supabase, 'list_pending_delegated_contacts_with_expired_literal_content_lease', params.limit ?? 50);
}

// A mais recente de TODAS (não só não-terminais) — "enviou?" precisa
// funcionar mesmo depois da tarefa já ter concluído/falhado/expirado.
export async function getMostRecentPendingDelegatedContact(
  supabase: AnySupabaseClient,
  params: { professionalId: string }
): Promise<PendingDelegatedContact | null> {
  const { data, error } = await supabase.rpc('get_most_recent_pending_delegated_contact', { p_professional_id: params.professionalId });
  if (error) throw new Error(`get_most_recent_pending_delegated_contact falhou: ${error.message}`);
  if (!data) return null;
  return mapRow(data as RawRow);
}

export async function getPendingDelegatedContactAwaitingReplyByConversation(
  supabase: AnySupabaseClient,
  params: { conversationId: string }
): Promise<PendingDelegatedContact | null> {
  const { data, error } = await supabase.rpc('get_pending_delegated_contact_awaiting_reply_by_conversation', { p_conversation_id: params.conversationId });
  if (error) throw new Error(`get_pending_delegated_contact_awaiting_reply_by_conversation falhou: ${error.message}`);
  if (!data) return null;
  return mapRow(data as RawRow);
}

export async function markPendingDelegatedContactExecuted(
  supabase: AnySupabaseClient,
  params: { id: string; createdConversationId: string; createdOutboundIntentId: string; noReplyHours?: number }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_executed', {
    p_id: params.id,
    p_created_conversation_id: params.createdConversationId,
    p_created_outbound_intent_id: params.createdOutboundIntentId,
    p_no_reply_hours: params.noReplyHours ?? 72,
  });
  if (error) throw new Error(`mark_pending_delegated_contact_executed falhou: ${error.message}`);
  return data === true;
}

export async function markPendingDelegatedContactFailed(supabase: AnySupabaseClient, params: { id: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_failed', { p_id: params.id });
  if (error) throw new Error(`mark_pending_delegated_contact_failed falhou: ${error.message}`);
  return data === true;
}
