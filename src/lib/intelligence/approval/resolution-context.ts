import type { SupabaseClient } from '@supabase/supabase-js';

import {
  computeMessageContentDigest,
  computeUsableText,
  type ActiveApprovalCandidate,
  type CommunicatedProposalCandidateEntry,
  type MessageWindowEntry,
  type ResolutionContextV1,
} from './canonicalize';
import { MAX_ACTIVE_CANDIDATES, MAX_CANDIDATES_PER_CHAIN, MAX_MESSAGE_WINDOW, RECENT_MESSAGE_WINDOW_SIZE } from './config';

// Doopla Intelligence Core v1 — Bloco 5: construção de ResolutionContext
// (V3.4 formalizado, V3.9/V3.10 bounded lineage). ÚNICA projeção usada
// como input real do resolver — nunca uma estrutura paralela pro
// cálculo de identidade (V3.4, achado 4): o mesmo objeto retornado
// aqui é o que vira JSON pro model E o que é canonicalizado pra
// context_identity.
//
// Budget fail-closed (V3.8/V3.9): se o universo de candidatos/mensagens
// exceder o teto, esta function NUNCA constrói uma projeção parcial —
// retorna budgetExceeded=true e o chamador (orchestrator) commita
// inconclusive/context_budget_exceeded ou chain_candidate_overflow SEM
// nunca chamar o resolver.

export type BuildResolutionContextResult =
  | { budgetExceeded: false; context: ResolutionContextV1 }
  | { budgetExceeded: true; reason: 'context_budget_exceeded' | 'chain_candidate_overflow' };

type ConversationMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  content_type: string;
  body: string | null;
  transcript: string | null;
  transcription_status: string | null;
  created_at: string;
};

export async function buildResolutionContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    professionalId: string;
    conversationId: string;
    professionalStatementMessageId: string;
    bookingId: string | null;
    opportunityId: string | null;
    structuralFacts: Record<string, unknown>;
  }
): Promise<BuildResolutionContextResult> {
  const { data: rootId, error: rootError } = await supabase.rpc('resolve_commercial_root_id', {
    p_booking_id: params.bookingId,
    p_opportunity_id: params.opportunityId,
  });
  if (rootError || !rootId) {
    throw new Error(`resolve_commercial_root_id falhou: ${rootError?.message ?? 'root nulo'}`);
  }
  const commercialRootId = rootId as string;

  // 1a. Candidatos comunicados abertos (bounded lineage, V3.9/V3.10) —
  // buscados uma única vez aqui e reaproveitados tanto pra ancorar o
  // messageWindow (passo 1b) quanto pro campo communicatedProposalCandidates
  // (passo 2) — nunca duas fontes divergentes do mesmo dado.
  const { data: candidatesRaw, error: candError } = await supabase.rpc('get_communicated_proposal_candidates', {
    p_professional_id: params.professionalId,
    p_booking_id: params.bookingId,
    p_opportunity_id: params.opportunityId,
  });
  if (candError) throw new Error(`get_communicated_proposal_candidates falhou: ${candError.message}`);

  const candidateRows = (candidatesRaw ?? []) as Array<{
    id: string;
    decision_category: string;
    subject_key: string;
    proposed_by: string;
    source_message_id: string;
    proposed_value: unknown;
  }>;

  // 1b. Bounded lineage (V3.9/V3.10): messageWindow = declaração do
  // profissional + últimas RECENT_MESSAGE_WINDOW_SIZE mensagens brutas
  // + toda mensagem-fonte de um candidato comunicado ainda aberto —
  // NUNCA o histórico bruto inteiro desde o início da chain (isso é
  // exatamente o que causava o deadlock resolvido pela V3.9).
  const { data: recentRaw, error: recentError } = await supabase
    .from('conversation_messages')
    .select('id, direction, author_type, content_type, body, transcript, transcription_status, created_at')
    .eq('conversation_id', params.conversationId)
    .order('created_at', { ascending: false })
    .limit(RECENT_MESSAGE_WINDOW_SIZE);
  if (recentError) throw new Error(`falha ao montar janela recente: ${recentError.message}`);

  const { data: statementRaw, error: statementError } = await supabase
    .from('conversation_messages')
    .select('id, direction, author_type, content_type, body, transcript, transcription_status, created_at')
    .eq('id', params.professionalStatementMessageId)
    .single();
  if (statementError || !statementRaw) throw new Error(`mensagem do profissional não encontrada: ${statementError?.message ?? params.professionalStatementMessageId}`);

  const candidateSourceIds = Array.from(new Set(candidateRows.map((c) => c.source_message_id)));

  let candidateSourceMessages: ConversationMessageRow[] = [];
  if (candidateSourceIds.length > 0) {
    const { data: sourcesRaw, error: sourcesError } = await supabase
      .from('conversation_messages')
      .select('id, direction, author_type, content_type, body, transcript, transcription_status, created_at')
      .in('id', candidateSourceIds);
    if (sourcesError) throw new Error(`falha ao buscar mensagens-fonte de candidatos: ${sourcesError.message}`);
    candidateSourceMessages = (sourcesRaw ?? []) as ConversationMessageRow[];
  }

  const byId = new Map<string, ConversationMessageRow>();
  for (const m of [...((recentRaw ?? []) as ConversationMessageRow[]), statementRaw as ConversationMessageRow, ...candidateSourceMessages]) {
    byId.set(m.id, m);
  }
  const fullWindow = Array.from(byId.values());

  // Budget fail-closed (V3.8/V3.9): backstop defensivo — na prática
  // este bound raramente é atingido (o mecanismo estrutural acima já
  // mantém o conjunto pequeno), mas continua tudo-ou-nada se ocorrer.
  if (fullWindow.length > MAX_MESSAGE_WINDOW) {
    return { budgetExceeded: true, reason: 'context_budget_exceeded' };
  }

  const messageWindow: MessageWindowEntry[] = fullWindow.map((m) => {
    const usableText = computeUsableText({
      contentType: m.content_type,
      body: m.body,
      transcript: m.transcript,
      transcriptionStatus: m.transcription_status,
    });
    return {
      messageId: m.id,
      authorType: m.author_type,
      contentDigest: computeMessageContentDigest({
        direction: m.direction,
        contentType: m.content_type,
        usableText,
        transcriptionStatus: m.transcription_status,
      }),
    };
  });

  // 2. Teto per-chain (V3.10) sobre os mesmos candidateRows já buscados acima.
  const perChainCount = new Map<string, number>();
  for (const c of candidateRows) {
    const key = `${c.decision_category}::${c.subject_key}`;
    perChainCount.set(key, (perChainCount.get(key) ?? 0) + 1);
  }
  for (const count of perChainCount.values()) {
    if (count > MAX_CANDIDATES_PER_CHAIN) {
      return { budgetExceeded: true, reason: 'chain_candidate_overflow' };
    }
  }
  if (candidateRows.length > MAX_ACTIVE_CANDIDATES) {
    return { budgetExceeded: true, reason: 'chain_candidate_overflow' };
  }

  const communicatedProposalCandidates: CommunicatedProposalCandidateEntry[] = candidateRows.map((c) => ({
    candidateId: c.id,
    decisionCategory: c.decision_category,
    subjectKey: c.subject_key,
    proposedBy: c.proposed_by,
    sourceMessageId: c.source_message_id,
    proposedValue: c.proposed_value as CommunicatedProposalCandidateEntry['proposedValue'],
  }));

  // 3. Approvals ativos (já aprovados, versão mais recente por chain).
  const { data: activeRaw, error: activeError } = await supabase.rpc('get_active_approvals', {
    p_professional_id: params.professionalId,
    p_booking_id: params.bookingId,
    p_opportunity_id: params.opportunityId,
  });
  if (activeError) throw new Error(`get_active_approvals falhou: ${activeError.message}`);

  const activeRows = (activeRaw ?? []) as Array<{
    id: string;
    decision_category: string;
    subject_key: string;
    approved_value: unknown;
    version: number;
  }>;
  if (activeRows.length > MAX_ACTIVE_CANDIDATES) {
    return { budgetExceeded: true, reason: 'chain_candidate_overflow' };
  }

  const activeApprovalCandidates: ActiveApprovalCandidate[] = activeRows.map((a) => ({
    approvalRecordId: a.id,
    decisionCategory: a.decision_category,
    subjectKey: a.subject_key,
    approvedValue: a.approved_value as ActiveApprovalCandidate['approvedValue'],
    version: a.version,
  }));

  return {
    budgetExceeded: false,
    context: {
      contextSchemaVersion: 'v1',
      professionalId: params.professionalId,
      commercialRootId,
      messageWindow,
      activeApprovalCandidates,
      communicatedProposalCandidates,
      structuralFacts: params.structuralFacts as ResolutionContextV1['structuralFacts'],
    },
  };
}
