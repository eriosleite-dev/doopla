import type { SupabaseClient } from '@supabase/supabase-js';

import type { PostModelGateResult } from './types';

// Doopla Intelligence Core v1 — Post-model Policy Gate: observabilidade
// append-only. Fina camada sobre record_policy_gate_decision (migration
// 0049) — nunca grava proposedResponse inteiro nem valores aprovados
// duplicados (isso já vive em approval_records, referenciável por
// matchedApprovalRecordId); só o necessário pra auditar/alimentar
// Admin/Observer/Red Team futuros sem acumular dado sensível
// redundante.

export type LogPolicyGateDecisionParams = {
  conversationId: string;
  commercialRootId: string;
  messageId: string | null;
  runId: string | null;
  result: PostModelGateResult;
};

export async function logPolicyGateDecision(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: LogPolicyGateDecisionParams
): Promise<{ id: string } | null> {
  const { data, error } = await supabase.rpc('record_policy_gate_decision', {
    p_conversation_id: params.conversationId,
    p_commercial_root_id: params.commercialRootId,
    p_message_id: params.messageId,
    p_run_id: params.runId,
    p_outcome: params.result.outcome,
    p_policy_version: params.result.policyVersion,
    p_primary_block_reason: params.result.primaryBlockReason,
    p_checks: params.result.checks.map((c) => ({
      decisionCategory: c.decisionCategory,
      subjectKey: c.subjectKey,
      result: c.result,
      blockReason: c.blockReason,
      matchedApprovalRecordId: c.matchedApprovalRecordId,
      // Só o rastro necessário pra entender POR QUE bloqueou — nunca
      // duplicado quando result='matched' (o valor real já está em
      // approval_records, via matchedApprovalRecordId).
      extractedValueForDebug: c.result === 'blocked' ? c.extractedValueForDebug : null,
    })),
  });

  if (error || !data) return null;
  return data as { id: string };
}
