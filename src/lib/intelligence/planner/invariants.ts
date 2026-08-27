import type { ClassificationStatus, ConfidenceLevel, Intent } from '../classification';
import type { ContextFact, ContextSection } from '../context-builder';
import { INTENT_MANDATORY_DECISION_CATEGORIES, PROFESSIONAL_DECISION_CATEGORIES } from './decision-categories';
import type { ProfessionalDecisionCategory } from './decision-categories';
import type { PlannerModelResponsePlan, ResponsePlan } from './response-plan';
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

// Limites defensivos contra um model quebrado/adversarial devolvendo
// arrays sem limite (custo de token, DoS, ruído em observability). Não
// é uma regra de produto — é higiene estrutural, mesmo espírito do
// "?? []" em competencies.ts: nunca deveria acontecer, mas se
// acontecesse, nunca pode virar uma exceção nem um array sem limite
// fluindo até persistência.
export const MAX_EVIDENCE_USED = 20;
export const MAX_MISSING_INFORMATION = 20;

// Intents que, pela própria definição no Bloco 3 (ver
// classification/prompt.ts), são SEMPRE negociação prospectiva — nunca
// existe uma leitura válida de "isto é só o relato de um fato já
// resolvido" pra eles. "orcamento" é explicitamente sobre um trabalho
// NOVO/hipotético (nunca um já existente); "desconto" é explicitamente
// negociação prospectiva, nunca relato. Por isso o código pode (e
// deve) rejeitar commitmentNature="report_existing_fact" pra estes
// dois SEM depender do model — mesmo que ele cite uma evidência real
// (ex.: o valor antigo de um booking) pra "justificar" isso. Os
// outros intents (booking_update/condicao_pagamento/etc.) legitimamente
// podem ser um relato OU uma mudança, então essa distinção continua
// dependendo do julgamento semântico do model pra eles — documentado
// como risco residual, não escondido.
const INTENT_ALWAYS_PROSPECTIVE = new Set<Intent>(['orcamento', 'desconto']);

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

// Saneia a lista do model: dedupe + só entradas de fato grounded +
// bounded. Achado de precedente do Bloco 3 (secondaryIntents não
// deduplicado) aplicado aqui de propósito antes de qualquer outro
// cálculo. O corte de MAX_EVIDENCE_USED é determinístico (preserva a
// ordem, sempre os primeiros) — nunca aleatório.
export function validateEvidenceUsed(rawEvidence: readonly EvidenceUsed[], ctx: PlannerContext): EvidenceUsed[] {
  const seen = new Set<string>();
  const result: EvidenceUsed[] = [];
  for (const e of rawEvidence) {
    if (result.length >= MAX_EVIDENCE_USED) break;
    if (!isEvidenceGrounded(e, ctx)) continue;
    const key = e.sourceType === 'conversation_message' ? `conversation_message:${e.sourceId}` : `${e.sourceType}:${e.sourceId}:${e.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(e);
  }
  return result;
}

export function boundMissingInformation(raw: readonly MissingInformationItem[]): MissingInformationItem[] {
  return raw.slice(0, MAX_MISSING_INFORMATION);
}

// commitmentNature reportado pelo model só é aceito como
// 'report_existing_fact' se: (a) o intent não for um dos que são
// sempre prospectivos por definição (ver INTENT_ALWAYS_PROSPECTIVE —
// piso determinístico, nunca depende do model), e (b) houver pelo
// menos uma evidência (já validada) sustentando isso. Sem qualquer um
// dos dois, cai pro lado mais conservador ('new_or_changed_commitment'),
// nunca o contrário.
export function resolveCommitmentNature(modelValue: CommitmentNature, groundedEvidenceCount: number, intents: readonly Intent[]): CommitmentNature {
  if (modelValue !== 'report_existing_fact') return modelValue;
  if (intents.some((i) => INTENT_ALWAYS_PROSPECTIVE.has(i))) return 'new_or_changed_commitment';
  if (groundedEvidenceCount === 0) return 'new_or_changed_commitment';
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
// é o profissional (força 'none' incondicionalmente).
// 'candidate_contextual' só sobrevive com lastro ANCORADO EM
// CONVERSA — pelo menos uma evidência do tipo conversation_message
// entre as grounded, nunca só fatos estruturados de fundo (professional_
// profile/opportunity/booking sozinhos). Achado de auditoria
// adversarial: "EvidenceUsed existe" não prova coreferência — o
// código não consegue provar deterministicamente que um fato
// estruturado citado É a mesma coisa que está sendo confirmada, então
// o mínimo exigível é que exista uma mensagem real da conversa
// ancorando a leitura. Isso NÃO resolve coreferência completa (duas
// propostas concorrentes citando mensagens diferentes ainda passam
// aqui) — ver limitação documentada no relatório de auditoria.
export function resolveProfessionalDecisionSignal(
  modelValue: ProfessionalDecisionSignal,
  triggerAuthorType: string | undefined,
  groundedEvidence: readonly EvidenceUsed[]
): ProfessionalDecisionSignal {
  if (triggerAuthorType !== 'professional') return 'none';
  if (modelValue !== 'candidate_contextual') return modelValue;
  const hasMessageAnchor = groundedEvidence.some((e) => e.sourceType === 'conversation_message');
  if (!hasMessageAnchor) return 'candidate_ambiguous';
  return modelValue;
}

export type ResponsePlanFloorInput = {
  modelPlan: PlannerModelResponsePlan;
  classificationStatus: ClassificationStatus;
  effectiveConfidence: ConfidenceLevel;
  requiresProfessionalDecision: boolean;
  professionalDecisionSignal: ProfessionalDecisionSignal;
  triggerHasUsableText: boolean;
  // Contagem de EvidenceUsed já validada (pós isEvidenceGrounded) —
  // achado de auditoria adversarial: sem isto, um model podia declarar
  // answer_with_known_information com evidenceUsed vazio (citando nada,
  // ou citando algo que a validação descartou) pra um intent sem
  // categoria mandatória, e nada bloqueava um draft fabricado de sair
  // como "resposta com fato conhecido" sem NENHUM fato real por trás.
  evidenceUsedCount: number;
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
  // Defesa em profundidade: wait_for_* nem existe no schema que o
  // model preenche (impossibilidade estrutural), mas se um bug futuro
  // afrouxar isso sem atualizar este arquivo, nunca deveria passar
  // batido — mesmo raciocínio do "?? []" em competencies.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planAsAny = plan as any;
  if (planAsAny === 'wait_for_external_participant') plan = 'ask_external_participant';
  if (planAsAny === 'wait_for_professional') plan = 'consult_professional';
  // answer_with_known_information: nunca quando há decisão nova em
  // jogo — "tenho o fato" nunca vira "posso confirmar/oferecer". E
  // nunca SEM nenhuma evidência grounded por trás — "responder com
  // fato conhecido" sem fato nenhum validado é uma contradição em
  // termos, não uma leitura permissiva.
  if (plan === 'answer_with_known_information' && (input.requiresProfessionalDecision || input.evidenceUsedCount === 0)) {
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

// Deriva requiresProfessionalReviewBeforeSend a partir do responsePlan
// FINAL (já pós-piso de resolveResponsePlan acima) — decisão do
// usuário (fechamento do Runtime): nunca a partir de
// requiresProfessionalDecision, que é um sinal do TURNO inteiro (ex.:
// intent=orcamento sempre ativa price_or_cache/accept_or_decline_work),
// não do texto específico deste responsePlan — usá-lo aqui bloquearia
// autonomamente até uma simples pergunta de esclarecimento
// (ask_external_participant) feita no meio de uma negociação, que já é
// um resultado esperado e testado (golden-suite.ts, "novo compromisso
// — desconto": ask_external_participant é família aceita mesmo com
// requiresProfessionalDecision=true).
//
// consult_professional: pode estar endereçado ao próprio profissional
// (ver prompt.ts) ou pedir uma decisão de compromisso — sempre exige
// revisão. answer_with_known_information: nunca é compromisso, mas
// pode carregar dado potencialmente sensível (telefone/endereço de
// terceiros) que este bloco não classifica por campo — mantido
// conservador de propósito (golden-suite audita isso). Os demais
// quatro planos (acknowledge/ask_external_participant/
// clarify_ambiguity/no_response_needed) nunca afirmam compromisso, por
// definição de prompt.ts — não precisam de revisão humana.
//
// Isto NUNCA é a garantia de conteúdo: mesmo com false aqui, o
// Post-model Policy Gate (Bloco 6) ainda lê o TEXTO real via
// extractCommitments — um responsePlan mal rotulado que na prática
// afirma um compromisso é pego por lá (no_matching_approval/
// stale_dependency/etc.), independente deste campo.
export function resolveRequiresProfessionalReviewBeforeSend(responsePlan: ResponsePlan): boolean {
  return responsePlan === 'consult_professional' || responsePlan === 'answer_with_known_information';
}
