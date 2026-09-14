import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { IntentClassification } from '../classification';
import type { ContextPackage } from '../context-builder';
import { getOpenAIClient } from '../openai-client';
import type { ToolContext } from '../types';
import { PLANNER_MAX_RETRIES, PLANNER_MODEL } from './config';
import { PROFESSIONAL_DECISION_CATEGORIES } from './decision-categories';
import {
  boundMissingInformation,
  computeDecisionCategories,
  deterministicFallbackResponse,
  filterCommitmentAuthorizingEvidence,
  missingInformationFallback,
  resolveCommitmentNature,
  resolveProfessionalDecisionSignal,
  resolveRequiresProfessionalReviewBeforeSend,
  resolveResponsePlan,
  validateEvidenceUsed,
} from './invariants';
import { buildPlannerContext } from './planner-context';
import { buildPlannerInstructions } from './prompt';
import { PLANNER_MODEL_RESPONSE_PLANS } from './response-plan';
import { COMMITMENT_NATURES, MISSING_INFORMATION_REASONS, PROFESSIONAL_DECISION_SIGNALS } from './types';
import type { PlannerDecision } from './types';

// Doopla Intelligence Core v1 — Bloco 4: Response Planner.
//
// O schema que o MODEL preenche é deliberadamente menor que
// PlannerDecision: sem requiresProfessionalDecision/
// professionalDecisionCategory finais (só invariants.ts, em código,
// preenche isso, unindo o mandatório com o que o model propôs) e sem
// requiresProfessionalReviewBeforeSend (derivado por
// resolveRequiresProfessionalReviewBeforeSend, invariants.ts, a partir
// só do responsePlan FINAL — fora do schema, estruturalmente
// impossível do model influenciar).
const evidenceUsedSchema = z.discriminatedUnion('sourceType', [
  z.object({ sourceType: z.literal('professional_profile'), sourceId: z.string(), field: z.string() }),
  z.object({ sourceType: z.literal('opportunity'), sourceId: z.string(), field: z.string() }),
  z.object({ sourceType: z.literal('booking'), sourceId: z.string(), field: z.string() }),
  z.object({ sourceType: z.literal('external_participant'), sourceId: z.string(), field: z.string() }),
  // Professional Intelligence Context — camada A ("context evidence"),
  // ver invariants.ts. Citável pelo model (prova que usou o dado pra
  // preparar a resposta), mas nunca conta como camada B (autorização de
  // compromisso) — filterCommitmentAuthorizingEvidence exclui as duas.
  z.object({ sourceType: z.literal('professional_business_context'), sourceId: z.string(), field: z.string() }),
  z.object({ sourceType: z.literal('professional_commercial_history'), sourceId: z.string(), field: z.string() }),
  z.object({ sourceType: z.literal('conversation_message'), sourceId: z.string() }),
]);

const missingInformationSchema = z.object({
  field: z.string(),
  reason: z.enum(MISSING_INFORMATION_REASONS),
  blocksProfessionalDecision: z.boolean(),
});

const modelOutputSchema = z.object({
  // Só o subconjunto de 6 valores — wait_for_* não existe neste
  // schema, então é estruturalmente impossível o model devolvê-los
  // (não é uma checagem em runtime descartando o valor).
  responsePlan: z.enum(PLANNER_MODEL_RESPONSE_PLANS),
  commitmentNature: z.enum(COMMITMENT_NATURES),
  proposedDecisionCategory: z.array(z.enum(PROFESSIONAL_DECISION_CATEGORIES)),
  missingInformation: z.array(missingInformationSchema),
  evidenceUsed: z.array(evidenceUsedSchema),
  professionalDecisionSignal: z.enum(PROFESSIONAL_DECISION_SIGNALS),
  proposedResponse: z.string().nullable(),
});
export type PlannerModelOutput = z.infer<typeof modelOutputSchema>;
// Exportado só pra auditoria/teste — prova estrutural (sem rede) de
// que wait_for_external_participant/wait_for_professional/qualquer
// valor fora do enum são rejeitados pelo próprio schema, não por uma
// checagem em runtime que poderia ser esquecida num refactor futuro.
export { modelOutputSchema as plannerModelOutputSchema };

export type PlannerModelCallResult = {
  parsed: PlannerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de classification/classify.ts.
export type PlannerModelCall = (params: { instructions: string; input: string }) => Promise<PlannerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<PlannerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: PLANNER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'response_plan') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

export type PlanResult = {
  decision: PlannerDecision;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de entrada. Recebe o ContextPackage e o IntentClassification
// JÁ RESOLVIDOS pelos blocos anteriores — nunca reclassifica, nunca monta
// contexto próprio, nunca chama tool nova, nunca toca supabase (prova
// estrutural: nem recebe capacidade de gravar nada, só lê toolCtx.conversation
// pra montar o PlannerContext). Nunca lança: qualquer falha cai no
// fallback determinístico abaixo, sempre o mais conservador do enum.
export async function planResponse(
  toolCtx: ToolContext,
  contextPackage: ContextPackage,
  intentClassification: IntentClassification,
  opts: { modelCall?: PlannerModelCall; maxRetries?: number } = {}
): Promise<PlanResult> {
  const plannerContext = buildPlannerContext(contextPackage, toolCtx.conversation, intentClassification);
  const instructions = buildPlannerInstructions();
  const input = JSON.stringify(plannerContext);
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? PLANNER_MAX_RETRIES;

  let parsed: PlannerModelOutput | null = null;
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
      // Engolido de propósito, mesmo padrão de classify.ts — nunca
      // propaga a mensagem crua do SDK pra fora deste módulo.
    }
  }

  const triggerHasUsableText = !!plannerContext.triggerMessage?.text?.trim();

  if (!parsed) {
    // Falha total do model: plano mais conservador possível — nunca
    // "sem decisão pendente" quando não conseguimos nem planejar.
    return {
      decision: {
        intentClassification,
        responsePlan: 'consult_professional',
        commitmentNature: 'new_or_changed_commitment',
        missingInformation: missingInformationFallback('planner_indisponivel'),
        evidenceUsed: [],
        requiresProfessionalDecision: true,
        professionalDecisionCategory: [],
        professionalDecisionSignal: 'none',
        proposedResponse: null,
        requiresProfessionalReviewBeforeSend: resolveRequiresProfessionalReviewBeforeSend('consult_professional'),
      },
      inputTokens,
      outputTokens,
    };
  }

  // evidenceUsed = camada A completa (context/reasoning evidence,
  // auditável) — nunca usada diretamente pelos invariantes de
  // compromisso abaixo. commitmentEvidence = camada B (subconjunto
  // restrito a COMMITMENT_AUTHORIZING_SOURCE_TYPES, ver invariants.ts)
  // — a única que pode influenciar commitmentNature/responsePlan/
  // professionalDecisionSignal. Mesmo comportamento de antes do
  // Professional Intelligence Context pras 5 fontes originais.
  const evidenceUsed = validateEvidenceUsed(parsed.evidenceUsed, plannerContext);
  const commitmentEvidence = filterCommitmentAuthorizingEvidence(evidenceUsed);
  const allIntents = [intentClassification.primaryIntent, ...intentClassification.secondaryIntents];
  const commitmentNature = resolveCommitmentNature(parsed.commitmentNature, commitmentEvidence.length, allIntents);
  const { categories, requiresProfessionalDecision } = computeDecisionCategories(allIntents, commitmentNature, parsed.proposedDecisionCategory);
  const professionalDecisionSignal = resolveProfessionalDecisionSignal(
    parsed.professionalDecisionSignal,
    plannerContext.triggerMessage?.authorType,
    commitmentEvidence
  );
  const responsePlan = resolveResponsePlan({
    modelPlan: parsed.responsePlan,
    classificationStatus: intentClassification.classificationStatus,
    effectiveConfidence: intentClassification.effectiveConfidence,
    requiresProfessionalDecision,
    professionalDecisionSignal,
    triggerHasUsableText,
    evidenceUsedCount: commitmentEvidence.length,
  });

  // O draft do model foi escrito pensando no plano QUE ELE propôs — se
  // o código rebaixou o plano por um piso que ele não previu (ex.:
  // answer_with_known_information -> consult_professional), o texto
  // não serve mais pro plano final e é descartado, nunca reaproveitado
  // fora do contexto pra que foi escrito. clarify_ambiguity/acknowledge
  // ainda fazem sentido com o draft original na maioria dos casos.
  const draftStillValid = responsePlan === parsed.responsePlan || responsePlan === 'clarify_ambiguity' || responsePlan === 'acknowledge';
  // Nunca silêncio quando há texto humano real no gatilho: se o draft
  // foi descartado (piso mudou o plano pra algo que o texto do model
  // não cobre) ou nunca existiu (no_response_needed legitimamente não
  // escreve nada), um fallback determinístico fecha a lacuna — ver
  // comentário em deterministicFallbackResponse (invariants.ts).
  const rawProposedResponse = draftStillValid ? parsed.proposedResponse : null;
  const proposedResponse = rawProposedResponse ?? (triggerHasUsableText ? deterministicFallbackResponse(responsePlan) : null);

  return {
    decision: {
      intentClassification,
      responsePlan,
      commitmentNature,
      missingInformation: boundMissingInformation(parsed.missingInformation),
      evidenceUsed,
      requiresProfessionalDecision,
      professionalDecisionCategory: categories,
      professionalDecisionSignal,
      proposedResponse,
      requiresProfessionalReviewBeforeSend: resolveRequiresProfessionalReviewBeforeSend(responsePlan),
    },
    inputTokens,
    outputTokens,
  };
}
