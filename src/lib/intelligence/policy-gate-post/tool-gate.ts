import type { SupabaseClient } from '@supabase/supabase-js';

import { evaluateCommitments } from './matcher';
import { POLICY_GATE_VERSION } from './config';
import type { ActiveApprovalForMatch, ExtractedCommitment, PostModelGateResult } from './types';

// Doopla Intelligence Core v1 — Post-model Policy Gate: gate de tool
// call, MESMO matcher de evaluatePostModelGate (gate.ts) — nunca uma
// segunda política desconectada (item 13 da spec do usuário).
//
// Diferença estrutural: uma tool call já chega com argumentos
// ESTRUTURADOS (o schema da própria tool) — não existe texto livre pra
// extrair. Por isso este caminho pula extractCommitments() por
// completo; o chamador (quem prepara a chamada da tool) já monta
// ExtractedCommitment[] diretamente a partir do input da tool.
//
// Deliberadamente NÃO importa tool-registry.ts nem estende
// ToolDefinition (types.ts, Bloco 1) — nenhuma tool de escrita/ação
// existe ainda no Tool Registry (só leitura), então não há nada real
// pra encadear agora, e Bloco 1 está congelado. Quando uma tool de
// escrita real existir, ela chama esta function diretamente com os
// commitments que seus próprios argumentos representam — nenhum
// wiring novo em tool-registry.ts é necessário pra isso funcionar.

export type ToolCallGateInput = {
  professionalId: string;
  bookingId: string | null;
  opportunityId: string | null;
  commitments: ExtractedCommitment[];
};

type ApprovalRecordRow = {
  id: string;
  decision_category: string;
  subject_key: string;
  approved_value: Record<string, unknown> | null;
  version: number;
  created_at: string;
};

export async function evaluateToolCallGate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: ToolCallGateInput
): Promise<PostModelGateResult> {
  if (input.commitments.length === 0) {
    return { outcome: 'allowed', checks: [], policyVersion: POLICY_GATE_VERSION, primaryBlockReason: null };
  }

  const { data: rootId, error: rootError } = await supabase.rpc('resolve_commercial_root_id', {
    p_booking_id: input.bookingId,
    p_opportunity_id: input.opportunityId,
  });
  if (rootError || !rootId) {
    throw new Error(`resolve_commercial_root_id falhou: ${rootError?.message ?? 'root nulo'}`);
  }
  const commercialRootId = rootId as string;

  const [approvalsRes, terminalRes] = await Promise.all([
    supabase.rpc('get_active_approvals', {
      p_professional_id: input.professionalId,
      p_booking_id: input.bookingId,
      p_opportunity_id: input.opportunityId,
    }),
    supabase.rpc('is_commercial_root_terminal', { p_commercial_root_id: commercialRootId }),
  ]);

  if (approvalsRes.error) throw new Error(`get_active_approvals falhou: ${approvalsRes.error.message}`);
  if (terminalRes.error) throw new Error(`is_commercial_root_terminal falhou: ${terminalRes.error.message}`);

  const activeApprovals: ActiveApprovalForMatch[] = ((approvalsRes.data ?? []) as ApprovalRecordRow[]).map((r) => ({
    approvalRecordId: r.id,
    decisionCategory: r.decision_category,
    subjectKey: r.subject_key,
    approvedValue: r.approved_value,
    version: r.version,
    createdAt: r.created_at,
  }));

  const isTerminal = terminalRes.data === true;

  return evaluateCommitments(input.commitments, activeApprovals, isTerminal);
}
