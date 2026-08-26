import type { SupabaseClient } from '@supabase/supabase-js';

import { extractCommitments, type PolicyGateExtractorModelCall } from './extractor';
import { evaluateCommitments } from './matcher';
import { POLICY_GATE_VERSION } from './config';
import type { ActiveApprovalForMatch, PostModelGateResult } from './types';

// Doopla Intelligence Core v1 — Post-model Policy Gate: ponto de
// entrada. Roda DEPOIS do Response Planner (Bloco 4) e ANTES de
// qualquer envio real (que ainda não existe — v1 só prova o
// comportamento via harness, nenhum wiring de produção).
//
// Nunca é um segundo Approval Resolver: só LÊ approval_records (via
// get_active_approvals, já existente do Bloco 5) — nunca escreve
// aprovação, nunca reinterpreta "sim"/"pode" do profissional. KNOW ≠
// APPROVE preservado: o Gate não pode confirmar nada que não esteja
// em approval_records real.

export type PostModelGateInput = {
  professionalId: string;
  bookingId: string | null;
  opportunityId: string | null;
  proposedResponse: string | null;
  // Resolução temporal (decisão do usuário) — nenhum destes tem
  // default implícito neste módulo. referenceTimestamp SEMPRE vem de
  // um dado estrutural real (ex.: conversation_messages.created_at da
  // mensagem-gatilho), nunca de new Date() do processo. timezone é
  // IANA explícito ou null (sem fonte confiável — não existe hoje
  // nenhuma coluna de timezone no schema; ver PROGRESS.md); null faz
  // o extrator tratar toda expressão temporal relativa como não-
  // resolvível, nunca assume um fuso. knownEventDate, quando o
  // commercial root já tem uma data estrutural conhecida (ex.:
  // bookings/opportunities.event_date), é fornecido por quem monta
  // este input — o Gate não busca isso sozinho.
  referenceTimestamp: string;
  timezone: string | null;
  knownEventDate: string | null;
};

type ApprovalRecordRow = {
  id: string;
  decision_category: string;
  subject_key: string;
  approved_value: Record<string, unknown> | null;
  version: number;
  created_at: string;
};

export async function evaluatePostModelGate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: PostModelGateInput,
  opts: { modelCall?: PolicyGateExtractorModelCall } = {}
): Promise<PostModelGateResult> {
  // Nada a enviar -> nada a verificar. Não é responsabilidade do Gate
  // decidir POR QUE o Planner não produziu draft (isso já foi
  // resolvido nos pisos determinísticos de planner/invariants.ts).
  if (!input.proposedResponse || !input.proposedResponse.trim()) {
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

  const [approvalsRes, terminalRes, extraction] = await Promise.all([
    supabase.rpc('get_active_approvals', {
      p_professional_id: input.professionalId,
      p_booking_id: input.bookingId,
      p_opportunity_id: input.opportunityId,
    }),
    supabase.rpc('is_commercial_root_terminal', { p_commercial_root_id: commercialRootId }),
    extractCommitments(
      input.proposedResponse,
      { referenceTimestamp: input.referenceTimestamp, timezone: input.timezone, knownEventDate: input.knownEventDate },
      opts
    ),
  ]);

  if (approvalsRes.error) throw new Error(`get_active_approvals falhou: ${approvalsRes.error.message}`);
  if (terminalRes.error) throw new Error(`is_commercial_root_terminal falhou: ${terminalRes.error.message}`);

  // Extrator indisponível (timeout/erro/parse inválido em todas as
  // tentativas) — decisão do usuário: bloqueio incondicional, nunca
  // "assume que não há compromisso" (fail-closed, mesmo padrão de
  // qualquer outra falha de model neste projeto).
  if (extraction.unavailable) {
    return { outcome: 'blocked', checks: [], policyVersion: POLICY_GATE_VERSION, primaryBlockReason: 'extraction_unavailable' };
  }

  const activeApprovals: ActiveApprovalForMatch[] = ((approvalsRes.data ?? []) as ApprovalRecordRow[]).map((r) => ({
    approvalRecordId: r.id,
    decisionCategory: r.decision_category,
    subjectKey: r.subject_key,
    approvedValue: r.approved_value,
    version: r.version,
    createdAt: r.created_at,
  }));

  const isTerminal = terminalRes.data === true;

  return evaluateCommitments(extraction.commitments, activeApprovals, isTerminal);
}
