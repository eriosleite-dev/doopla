import type { ClassificationStatus, ConfidenceLevel, Intent } from '../classification';
import type { ContextFact, ContextSection } from '../context-builder';
import { INTENT_MANDATORY_DECISION_CATEGORIES, PROFESSIONAL_DECISION_CATEGORIES } from './decision-categories';
import type { ProfessionalDecisionCategory } from './decision-categories';
import type { PlannerModelResponsePlan } from './response-plan';
import type { CommitmentNature, EvidenceUsed, MissingInformationItem, PlannerContext, ProfessionalDecisionSignal } from './types';

// Doopla Intelligence Core v1 — Bloco 4: invariantes determinísticas
// do Response Planner.
//
// Este arquivo é a autoridade final sobre o contrato do Planner — o
// model PROPÕE, este código só pode tornar a proposta MAIS
// conservadora (nunca menos), mesmo princípio de
// classification/confidence.ts aplicado a planejamento em vez de
// confiança. Nenhuma função aqui toca supabase — são todas puras,
// função de (saída do model, PlannerContext) -> valor final.

function factSection(ctx: PlannerContext, sourceType: EvidenceUsed['sourceType']): ContextSection<ContextFact> | null {
  switch (sourceType) {
    case 'professional_profile':
      return ctx.professional;
    case 'opportunity':
      return ctx.opportunity;
    case 'booking':
      return ctx.booking;
    case 'external_participant':
      return ctx.externalParticipant;
    case 'conversation_message':
      return null;
  }
}

// Único ponto que decide se uma EvidenceUsed é real — nunca confia no
// que o model afirma sem checar contra o PlannerContext de verdade.
export function isEvidenceGrounded(evidence: EvidenceUsed, ctx: PlannerContext): boolean {
  if (evidence.sourceType === 'conversation_message') {
    if (ctx.triggerMessage?.messageId === evidence.sourceId) return true;
    return ctx.recentMessages.some((m) => m.messageId === evidence.sourceId);
  }
  const section = factSection(ctx, evidence.sourceType);
  if (!section || section.status !== 'loaded') return false;
  return section.facts.some((f) => f.sourceId === evidence.sourceId && f.field === evidence.field);
}

// Saneia a lista do model: dedupe + só entradas de fato grounded.
// Achado de precedente do Bloco 3 (secondaryIntents não deduplicado)
// aplicado aqui de propósito antes de qualquer outro cálculo.
export function validateEvidenceUsed(rawEvidence: readonly EvidenceUsed[], ctx: PlannerContext): EvidenceUsed[] {
  const seen = new Set<string>();
  const result: EvidenceUsed[] = [];
  for (const e of rawEvidence) {
    if (!isEvidenceGrounded(e, ctx)) continue;
    const key = e.sourceType === 'conversation_message' ? `conversation_message:${e.sourceId}` : `${e.sourceType}:${e.sourceId}:${e.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(e);
  }
  return result;
}

// commitmentNature reportado pelo model só é aceito como
// 'report_existing_fact' se houver pelo menos uma evidência (já
// validada) sustentando isso — sem lastro, cai pro lado mais
// conservador ('new_or_changed_commitment'), nunca o contrário.
export function resolveCommitmentNature(modelValue: CommitmentNature, groundedEvidenceCount: number): CommitmentNature {
  if (modelValue === 'report_existing_fact' && groundedEvidenceCount === 0) return 'new_or_changed_commitment';
  return modelValue;
}

// União determinística: mandatórias (só quando commitmentNature É de
// fato uma tentativa de compromisso) + propostas pelo model,
// validadas contra o enum. O model nunca consegue remover uma
// categoria mandatória — só union, nunca subtração.
export function computeDecisionCategories(
  intents: readonly Intent[],
  commitmentNature: CommitmentNature,
  proposedCategories: readonly string[]
): { categories: ProfessionalDecisionCategory[]; requiresProfessionalDecision: boolean } {
  if (commitmentNature !== 'new_or_changed_commitment') {
    return { categories: [], requiresProfessionalDecision: false };
  }
  const validEnum = new Set<string>(PROFESSIONAL_DECISION_CATEGORIES);
  const selected = new Set<ProfessionalDecisionCategory>();
  for (const intent of intents) {
    for (const c of INTENT_MANDATORY_DECISION_CATEGORIES[intent]) selected.add(c);
  }
  for (const c of proposedCategories) {
    if (validEnum.has(c)) selected.add(c as ProfessionalDecisionCategory);
  }
  const categories = PROFESSIONAL_DECISION_CATEGORIES.filter((c) => selected.has(c));
  return { categories, requiresProfessionalDecision: categories.length > 0 };
}

// professionalDecisionSignal: nunca se aplica a mensagem de quem não
// é o profissional (força 'none' incondicionalmente); 'candidate_contextual'
// só sobrevive com lastro real (evidência grounded); sem lastro, cai
// pra 'candidate_ambiguous' — nunca o contrário.
export function resolveProfessionalDecisionSignal(
  modelValue: ProfessionalDecisionSignal,
  triggerAuthorType: string | undefined,
  groundedEvidenceCount: number
): ProfessionalDecisionSignal {
  if (triggerAuthorType !== 'professional') return 'none';
  if (modelValue === 'candidate_contextual' && groundedEvidenceCount === 0) return 'candidate_ambiguous';
  return modelValue;
}

export type ResponsePlanFloorInput = {
  modelPlan: PlannerModelResponsePlan;
  classificationStatus: ClassificationStatus;
  effectiveConfidence: ConfidenceLevel;
  requiresProfessionalDecision: boolean;
  professionalDecisionSignal: ProfessionalDecisionSignal;
  triggerHasUsableText: boolean;
};

// Piso final de responsePlan — cada regra só pode tornar o plano MAIS
// conservador que o proposto pelo model, nunca menos.
export function resolveResponsePlan(input: ResponsePlanFloorInput): PlannerModelResponsePlan {
  // Classificação não confiável o bastante pra planejar em cima dela,
  // OU o profissional pareceu confirmar algo mas sem referente claro
  // — os dois casos convergem pro mesmo piso.
  if (input.classificationStatus !== 'classified' || input.effectiveConfidence === 'low' || input.professionalDecisionSignal === 'candidate_ambiguous') {
    return 'clarify_ambiguity';
  }
  let plan = input.modelPlan;
  // answer_with_known_information: nunca quando há decisão nova em
  // jogo — "tenho o fato" nunca vira "posso confirmar/oferecer".
  if (plan === 'answer_with_known_information' && input.requiresProfessionalDecision) {
    plan = 'consult_professional';
  }
  // no_response_needed reservado pra gatilho sem texto utilizável —
  // qualquer mensagem humana real com conteúdo merece ao menos um
  // acknowledge, nunca silêncio.
  if (plan === 'no_response_needed' && input.triggerHasUsableText) {
    plan = 'acknowledge';
  }
  return plan;
}

export function missingInformationFallback(field: string): MissingInformationItem[] {
  return [{ field, reason: 'unavailable', blocksProfessionalDecision: true }];
}
