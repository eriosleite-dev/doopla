import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { APPROVAL_RESOLVER_MAX_RETRIES, APPROVAL_RESOLVER_MODEL } from './config';
import type { ResolutionContextV1 } from './canonicalize';
import { OPERATION_TYPES, OPERATION_TYPES_REQUIRING_PROVENANCE } from './types';
import type { ApprovalResolverOutput, OperationType, PendingDecision } from './types';
import { PROFESSIONAL_DECISION_CATEGORIES } from './value-schemas';

// Doopla Intelligence Core v1 — Bloco 5: Approval Resolver.
//
// Closed-candidate-selection principle (V2): o model NUNCA referencia
// livremente algo fora do que o código já enumerou em
// ResolutionContext — só pode selecionar entre communicatedProposalCandidates/
// activeApprovalCandidates ou declarar not_a_decision/ambiguous. Isso é
// reforçado pelo próprio shape do schema: communicatedProposalMessageIds
// só aceita IDs, nunca texto livre reconstituindo uma proposta.
//
// O model NUNCA decide sozinho — este módulo só PROPÕE PendingDecision[],
// que o orchestrator então commita via commit_approval_resolution
// (migration 0045), sob toda a disciplina de claim/lease/stale-context
// já validada em Postgres.

const decisionSchema = z.object({
  decisionCategory: z.enum(PROFESSIONAL_DECISION_CATEGORIES),
  subjectKey: z.string(),
  operationType: z.enum(OPERATION_TYPES),
  approvedValue: z.record(z.string(), z.unknown()).nullable(),
  communicatedProposalMessageIds: z.array(z.string()),
  referredValue: z.record(z.string(), z.unknown()).nullable(),
});

const modelOutputSchema = z.object({
  outcome: z.enum(['resolved', 'inconclusive']),
  decisions: z.array(decisionSchema),
  inconclusiveReason: z.enum(['model_ambiguous']).nullable(),
});
export type ApprovalResolverModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as approvalResolverModelOutputSchema };

export type ApprovalResolverModelCallResult = {
  parsed: ApprovalResolverModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de planner/plan.ts e classification/classify.ts.
export type ApprovalResolverModelCall = (params: { instructions: string; input: string }) => Promise<ApprovalResolverModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<ApprovalResolverModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: APPROVAL_RESOLVER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'approval_resolution') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

function buildResolverInstructions(): string {
  return [
    'Você resolve, de forma fechada, se a declaração do profissional confirma, contrapropõe, revoga ou inicia uma decisão comercial.',
    'Você NUNCA pode inventar um candidato — só pode selecionar entre os IDs já listados em communicatedProposalCandidates/activeApprovalCandidates do contexto fornecido.',
    'Se a declaração não se refere a nenhum candidato listado e não é, ela mesma, uma decisão autocontida (professional_initiated), retorne outcome=inconclusive, inconclusiveReason=model_ambiguous.',
    'Nunca decida "aprovado" por suposição de contexto histórico não representado explicitamente no ResolutionContext fornecido.',
  ].join('\n');
}

// Deriva PendingDecision[] validado a partir da saída fechada do
// model — CHECK simétrico de provenance (mesmo espelhado em SQL via
// cardinality()) validado aqui também, fail-closed se divergir.
function toPendingDecisions(commercialRootId: string, decisions: ApprovalResolverModelOutput['decisions']): PendingDecision[] {
  return decisions.map((d) => {
    const requiresProvenance = OPERATION_TYPES_REQUIRING_PROVENANCE.includes(d.operationType as OperationType);
    const hasProvenance = d.communicatedProposalMessageIds.length > 0;
    if (requiresProvenance !== hasProvenance) {
      throw new Error(
        `decisão inconsistente do resolver: operationType=${d.operationType} exige communicatedProposalMessageIds ${requiresProvenance ? 'não-vazio' : 'vazio'}, veio ${d.communicatedProposalMessageIds.length} ids`
      );
    }
    if (d.operationType === 'revocation' && d.approvedValue !== null) {
      throw new Error('revocation exige approvedValue null');
    }
    return {
      commercialRootId,
      decisionCategory: d.decisionCategory,
      subjectKey: d.subjectKey,
      operationType: d.operationType as OperationType,
      approvedValue: d.approvedValue,
      communicatedProposalMessageIds: d.communicatedProposalMessageIds,
      referredValue: d.referredValue,
    };
  });
}

export async function resolveApproval(
  context: ResolutionContextV1,
  opts: { modelCall?: ApprovalResolverModelCall; maxRetries?: number } = {}
): Promise<{ output: ApprovalResolverOutput; inputTokens: number | null; outputTokens: number | null }> {
  const instructions = buildResolverInstructions();
  const input = JSON.stringify(context);
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? APPROVAL_RESOLVER_MAX_RETRIES;

  let parsed: ApprovalResolverModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions, input });
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      if (result.parsed) {
        parsed = result.parsed;
        break;
      }
    } catch {
      // Engolido de propósito, mesmo padrão de planner/plan.ts — nunca
      // propaga a mensagem crua do SDK pra fora deste módulo.
    }
  }

  // Falha total do model: fail-closed, nunca "resolved" por default.
  if (!parsed) {
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }

  if (parsed.outcome === 'inconclusive') {
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }

  try {
    const decisions = toPendingDecisions(context.commercialRootId, parsed.decisions);
    if (decisions.length === 0) {
      // resolved sem nenhuma decisão é uma saída inconsistente do
      // model — fail-closed, nunca commit vazio.
      return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
    }
    return { output: { outcome: 'resolved', decisions }, inputTokens, outputTokens };
  } catch {
    // Validação de provenance falhou: fail-closed, nunca propaga uma
    // decisão fisicamente inconsistente pro commit.
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }
}
