import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrappers finos sobre
// runtime_pending_replies (migration 0053). Estado de workflow
// SEPARADO do audit log (policy_gate_decisions continua append-only,
// nunca lido como fila — decisão do usuário). Matching (quais
// pendências uma nova/uma approval afeta) é 100% código puro em
// pending-replies-matching.ts, nunca decidido aqui — estas funções só
// executam o que já foi decidido.

export type RuntimePendingReply = {
  id: string;
  conversationId: string;
  commercialRootId: string;
  triggerMessageId: string;
  policyGateDecisionId: string;
  runId: string | null;
  status: 'pending' | 'completed' | 'superseded';
  supersededById: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type RuntimePendingReplyRow = {
  id: string;
  conversation_id: string;
  commercial_root_id: string;
  trigger_message_id: string;
  policy_gate_decision_id: string;
  run_id: string | null;
  status: 'pending' | 'completed' | 'superseded';
  superseded_by_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

function fromRow(row: RuntimePendingReplyRow): RuntimePendingReply {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    commercialRootId: row.commercial_root_id,
    triggerMessageId: row.trigger_message_id,
    policyGateDecisionId: row.policy_gate_decision_id,
    runId: row.run_id,
    status: row.status,
    supersededById: row.superseded_by_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function createRuntimePendingReply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    conversationId: string;
    commercialRootId: string;
    triggerMessageId: string;
    policyGateDecisionId: string;
    runId: string | null;
    supersedeIds: string[];
  }
): Promise<RuntimePendingReply> {
  const { data, error } = await supabase
    .rpc('create_runtime_pending_reply', {
      p_conversation_id: params.conversationId,
      p_commercial_root_id: params.commercialRootId,
      p_trigger_message_id: params.triggerMessageId,
      p_policy_gate_decision_id: params.policyGateDecisionId,
      p_run_id: params.runId,
      p_supersede_ids: params.supersedeIds,
    })
    .single();
  if (error || !data) throw new Error(`create_runtime_pending_reply falhou: ${error?.message ?? 'sem dado'}`);
  return fromRow(data as RuntimePendingReplyRow);
}

export async function listPendingRuntimeReplies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  commercialRootId: string
): Promise<RuntimePendingReply[]> {
  const { data, error } = await supabase.rpc('list_pending_runtime_replies', { p_commercial_root_id: commercialRootId });
  if (error) throw new Error(`list_pending_runtime_replies falhou: ${error.message}`);
  return ((data ?? []) as RuntimePendingReplyRow[]).map(fromRow);
}

export async function resolveRuntimePendingReplyAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    pendingReplyId: string;
    newPolicyGateDecisionId: string;
    runId: string | null;
    // null só no caso raro em que a retomada muda o destinatário pro
    // profissional (ex.: responsePlan virou consult_professional na
    // reavaliação) — aí a function só faz o claim, sem outbound_intent
    // (chamador usa persistAiMessage por fora, best-effort).
    outbound: { channel: string; recipientExternalParticipantId: string; content: string } | null;
  }
): Promise<{ claimed: boolean; outboundIntentId: string | null }> {
  const { data, error } = await supabase
    .rpc('resolve_runtime_pending_reply_allowed', {
      p_pending_reply_id: params.pendingReplyId,
      p_new_policy_gate_decision_id: params.newPolicyGateDecisionId,
      p_run_id: params.runId,
      p_channel: params.outbound?.channel ?? null,
      p_recipient_external_participant_id: params.outbound?.recipientExternalParticipantId ?? null,
      p_content: params.outbound?.content ?? null,
    })
    .single();
  if (error || !data) throw new Error(`resolve_runtime_pending_reply_allowed falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { claimed: boolean; outbound_intent_id: string | null };
  return { claimed: row.claimed, outboundIntentId: row.outbound_intent_id };
}

export async function resolveRuntimePendingReplyStillBlocked(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { pendingReplyId: string; newPolicyGateDecisionId: string; runId: string | null }
): Promise<{ claimed: boolean; newPendingReplyId: string | null }> {
  const { data, error } = await supabase
    .rpc('resolve_runtime_pending_reply_still_blocked', {
      p_pending_reply_id: params.pendingReplyId,
      p_new_policy_gate_decision_id: params.newPolicyGateDecisionId,
      p_run_id: params.runId,
    })
    .single();
  if (error || !data) throw new Error(`resolve_runtime_pending_reply_still_blocked falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { claimed: boolean; new_pending_reply_id: string | null };
  return { claimed: row.claimed, newPendingReplyId: row.new_pending_reply_id };
}

export async function supersedeRuntimePendingRepliesForTerminalRoot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  commercialRootId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('supersede_runtime_pending_replies_for_terminal_root', { p_commercial_root_id: commercialRootId });
  if (error) throw new Error(`supersede_runtime_pending_replies_for_terminal_root falhou: ${error.message}`);
  return (data as number) ?? 0;
}

// GateCheckSnapshot — mesmo shape que log.ts (policy-gate-post) grava
// em policy_gate_decisions.checks. Lido direto da tabela (service_role
// bypassa RLS; sem necessidade de RPC nova só pra leitura — mesmo
// raciocínio já usado em outros pontos do Runtime).
export type GateCheckSnapshot = {
  decisionCategory: string;
  subjectKey: string | null;
  result: 'matched' | 'blocked';
  blockReason: string | null;
};

export async function fetchPolicyGateDecisionChecks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  policyGateDecisionId: string
): Promise<GateCheckSnapshot[]> {
  const { data, error } = await supabase.from('policy_gate_decisions').select('checks').eq('id', policyGateDecisionId).maybeSingle<{ checks: GateCheckSnapshot[] }>();
  if (error) throw new Error(`leitura de policy_gate_decisions.checks falhou: ${error.message}`);
  return data?.checks ?? [];
}
