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
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'executed'
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

export async function markPendingDelegatedContactExecuted(
  supabase: AnySupabaseClient,
  params: { id: string; createdConversationId: string; createdOutboundIntentId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_executed', {
    p_id: params.id,
    p_created_conversation_id: params.createdConversationId,
    p_created_outbound_intent_id: params.createdOutboundIntentId,
  });
  if (error) throw new Error(`mark_pending_delegated_contact_executed falhou: ${error.message}`);
  return data === true;
}

export async function markPendingDelegatedContactFailed(supabase: AnySupabaseClient, params: { id: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_pending_delegated_contact_failed', { p_id: params.id });
  if (error) throw new Error(`mark_pending_delegated_contact_failed falhou: ${error.message}`);
  return data === true;
}
