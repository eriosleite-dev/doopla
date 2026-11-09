import type { SupabaseClient } from '@supabase/supabase-js';

import {
  computeMessageContentDigest,
  computeUsableText,
  type ActiveApprovalCandidate,
  type CommunicatedProposalCandidateEntry,
  type MessageContentEntry,
  type MessageWindowEntry,
  type ResolutionContextV1,
} from './canonicalize';
import { MAX_ACTIVE_CANDIDATES, MAX_CANDIDATES_PER_CHAIN, MAX_MESSAGE_WINDOW, RECENT_MESSAGE_WINDOW_SIZE } from './config';
import { CONTEXT_MAX_MESSAGE_TEXT_CHARS, truncateText } from '../context-builder/budget';

// Doopla Intelligence Core v1 — Bloco 5: construção de ResolutionContext
// (V3.4 formalizado, V3.9/V3.10 bounded lineage). ÚNICA projeção usada
// como input real do resolver — nunca uma estrutura paralela pro
// cálculo de identidade (V3.4, achado 4): o mesmo objeto retornado
// aqui é o que vira JSON pro model E o que é canonicalizado pra
// context_identity — EXCETO messageContents (ver comentário em
// canonicalize.ts), campo irmão de messageWindow que carrega o
// conteúdo legível pro model e nunca participa do cálculo de
// context_identity, de propósito.
//
// Budget fail-closed (V3.8/V3.9): se o universo de candidatos/mensagens
// exceder o teto, esta function NUNCA constrói uma projeção parcial —
// retorna budgetExceeded=true e o chamador (orchestrator) commita
// inconclusive/context_budget_exceeded ou chain_candidate_overflow SEM
// nunca chamar o resolver.

// commercialRootId sempre presente no branch de overflow (resolvido
// ANTES de qualquer checagem de budget) — usado pelo chamador
// (orchestrator) pra registrar a condição via record_resolution_overflow
// (migration 0047), nunca em approval_resolutions. decisionCategory/
// subjectKey/magnitude só quando o overflow é atribuível a UMA chain
// específica (teto per-chain) — ausentes nos overflows "globais"
// (janela de mensagens, teto de candidatos ativos).
export type BuildResolutionContextResult =
  | { budgetExceeded: false; context: ResolutionContextV1 }
  | {
      budgetExceeded: true;
      reason: 'context_budget_exceeded' | 'chain_candidate_overflow';
      commercialRootId: string;
      decisionCategory?: string;
      subjectKey?: string;
      magnitude?: number;
    };

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

  // Achado real (smoke test do Beta Runtime Integration): pipeline.ts
  // roda detectInboundProposal/registerInboundProposal (registra um
  // candidato a partir da mensagem inbound corrente, de QUALQUER autor,
  // migration 0053) ANTES de chamar runApprovalEngine sobre essa MESMA
  // mensagem (pipeline.ts:211-224 antes de :243-244) — então quando o
  // profissional propõe um valor novo na própria declaração ("Pode
  // fechar por R$3000!"), get_communicated_proposal_candidates já
  // devolve, nesta mesma chamada, um candidato cuja source_message_id é
  // a PRÓPRIA professionalStatementMessageId. Um candidato "comunicado"
  // não pode legitimamente ser a mesma mensagem que o resolver está
  // decidindo agora (confirmação pressupõe algo comunicado ANTES) —
  // sem este filtro, o model via um candidato circular idêntico ao que
  // estava resolvendo e retornava inconclusive/model_ambiguous mesmo
  // pra uma declaração autocontida (professional_initiated, que não
  // exige nenhum candidato). Filtrado aqui, na origem única dos 3 usos
  // de candidateRows (messageWindow, teto per-chain,
  // communicatedProposalCandidates) — nunca em duas fontes divergentes.
  const candidateRows = ((candidatesRaw ?? []) as Array<{
    id: string;
    decision_category: string;
    subject_key: string;
    proposed_by: string;
    source_message_id: string;
    proposed_value: unknown;
  }>).filter((c) => c.source_message_id !== params.professionalStatementMessageId);

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
    return { budgetExceeded: true, reason: 'context_budget_exceeded', commercialRootId, magnitude: fullWindow.length };
  }

  const messageWindow: MessageWindowEntry[] = [];
  // Conteúdo legível pro model (ver comentário em canonicalize.ts) —
  // mesma fonte (computeUsableText) que já alimenta contentDigest
  // abaixo, nunca uma segunda leitura divergente do conteúdo. Truncado
  // com o MESMO helper/limite já usado pelo Context Builder
  // (Classifier/Planner, context-builder/budget.ts) — nunca uma
  // política de truncamento nova.
  const messageContents: MessageContentEntry[] = [];
  for (const m of fullWindow) {
    const usableText = computeUsableText({
      contentType: m.content_type,
      body: m.body,
      transcript: m.transcript,
      transcriptionStatus: m.transcription_status,
    });
    messageWindow.push({
      messageId: m.id,
      authorType: m.author_type,
      contentDigest: computeMessageContentDigest({
        direction: m.direction,
        contentType: m.content_type,
        usableText,
        transcriptionStatus: m.transcription_status,
      }),
    });
    messageContents.push({
      messageId: m.id,
      usableText: usableText === null ? null : truncateText(usableText, CONTEXT_MAX_MESSAGE_TEXT_CHARS).value,
    });
  }

  // 2. Teto per-chain (V3.10) sobre os mesmos candidateRows já buscados acima.
  const perChainCount = new Map<string, { decisionCategory: string; subjectKey: string; count: number }>();
  for (const c of candidateRows) {
    const key = `${c.decision_category} ${c.subject_key}`;
    const entry = perChainCount.get(key);
    if (entry) entry.count += 1;
    else perChainCount.set(key, { decisionCategory: c.decision_category, subjectKey: c.subject_key, count: 1 });
  }
  for (const { decisionCategory, subjectKey, count } of perChainCount.values()) {
    if (count > MAX_CANDIDATES_PER_CHAIN) {
      return { budgetExceeded: true, reason: 'chain_candidate_overflow', commercialRootId, decisionCategory, subjectKey, magnitude: count };
    }
  }
  if (candidateRows.length > MAX_ACTIVE_CANDIDATES) {
    return { budgetExceeded: true, reason: 'chain_candidate_overflow', commercialRootId, magnitude: candidateRows.length };
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
    return { budgetExceeded: true, reason: 'chain_candidate_overflow', commercialRootId, magnitude: activeRows.length };
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
      messageContents,
    },
  };
}
