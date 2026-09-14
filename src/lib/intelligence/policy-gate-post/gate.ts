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
  // Fronteira do Runtime (decisão final do usuário, migration 0051):
  // quem recebe proposedResponse. is_operationally_ready() só é
  // consultado quando 'external_participant' — mensagem endereçada ao
  // próprio profissional nunca aciona a checagem de dados de
  // recebimento (não é uma comunicação comercial externa).
  recipientType: 'external_participant' | 'professional';
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

  // Sem NENHUM commercial root ainda (nem booking nem opportunity) —
  // cenário real e esperado: intake/discovery puro, antes de o
  // Classifier (Bloco 3) ter detectado orçamento/disponibilidade
  // (fronteira do Runtime, decisão final do usuário: "a Doopla pode
  // receber o lead, responder, se apresentar... isso ainda é
  // intake/discovery comercial e não deve ser bloqueado"). Sem root
  // não existe get_active_approvals pra consultar — resolve_commercial_root_id
  // lançaria. Em vez de bloquear TUDO incondicionalmente (o que
  // impediria a própria saudação/coleta de contexto), roda só o
  // extrator (puro, sem supabase): texto sem nenhum compromisso
  // concreto passa livre; qualquer compromisso extraído aqui é
  // estruturalmente INGROUNDÁVEL (não pode haver approval real sem
  // commercial root) — fail-closed, nunca "assume que está tudo bem".
  if (!input.bookingId && !input.opportunityId) {
    const extraction = await extractCommitments(
      input.proposedResponse,
      { referenceTimestamp: input.referenceTimestamp, timezone: input.timezone, knownEventDate: input.knownEventDate },
      opts
    );
    if (extraction.unavailable) {
      return { outcome: 'blocked', checks: [], policyVersion: POLICY_GATE_VERSION, primaryBlockReason: 'extraction_unavailable' };
    }
    if (extraction.commitments.length === 0) {
      return { outcome: 'allowed', checks: [], policyVersion: POLICY_GATE_VERSION, primaryBlockReason: null };
    }
    const checks = extraction.commitments.map((c) => ({
      decisionCategory: c.decisionCategory,
      subjectKey: null,
      result: 'blocked' as const,
      blockReason: 'no_matching_approval' as const,
      matchedApprovalRecordId: null,
      extractedValueForDebug: c.rawValue,
    }));
    return { outcome: 'blocked', checks, policyVersion: POLICY_GATE_VERSION, primaryBlockReason: 'no_matching_approval' };
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
    supabase.rpc('is_commercial_root_terminal', {
      p_commercial_root_id: commercialRootId,
      // Migration 0051: caminho is_system_caller() (service_role, sem
      // auth.uid()) exige p_professional_id explícito — mesma
      // provenance já usada acima em get_active_approvals e abaixo em
      // is_operationally_ready (input.professionalId, resolvido pelo
      // Orchestrator/Runtime a partir do canal, nunca do próprio
      // texto da mensagem). commercial_root_belongs_to_professional
      // continua a única checagem de ownership nos dois caminhos —
      // este parâmetro só diz DE ONDE vem o professional_id, nunca
      // pula a verificação.
      p_professional_id: input.professionalId,
    }),
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

  // Fronteira do Runtime (decisão final do usuário): is_operationally_ready
  // só é consultado quando existe algo concreto pra checar (extração
  // não-vazia) E o destinatário é externo — intake/discovery puro e
  // mensagens internas ao próprio profissional nunca pagam essa query
  // nem podem ser bloqueados por ela.
  let isProfessionalReady = true;
  if (extraction.commitments.length > 0 && input.recipientType === 'external_participant') {
    const readyRes = await supabase.rpc('is_operationally_ready', { p_profile_id: input.professionalId });
    if (readyRes.error) throw new Error(`is_operationally_ready falhou: ${readyRes.error.message}`);
    isProfessionalReady = readyRes.data === true;
  }

  return evaluateCommitments(extraction.commitments, activeApprovals, isTerminal, isProfessionalReady);
}
