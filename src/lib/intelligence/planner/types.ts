import type { IntentClassification } from '../classification';
import type { ContextFact, ContextFactSourceType, ContextSection } from '../context-builder';
import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import type { ProfessionalDecisionCategory } from './decision-categories';
import type { ResponsePlan } from './response-plan';

// Doopla Intelligence Core v1 — Bloco 4: tipos do Response Planner.
//
// Percepção (Bloco 3) → PLANEJAMENTO (Bloco 4) → draft. Nunca
// planejamento → envio/execução. Nenhum campo aqui pode representar
// approval, execução de tool, transição de estado, ou envio — isso é
// estrutural, não uma convenção a lembrar (ver PlannerDecision
// abaixo: requiresProfessionalReviewBeforeSend é um tipo literal
// `true`, fora do schema que o model preenche).

// ============================================================
// CommitmentNature — INTENT ≠ DECISION.
//
// Distingue, dentro de um mesmo intent, se o turno está RELATANDO um
// fato já resolvido ("qual foi mesmo o valor combinado?") ou
// tentando CRIAR/ALTERAR um compromisso ("pode fazer por 2500?").
// Só o segundo caso ativa INTENT_MANDATORY_DECISION_CATEGORIES.
// 'not_applicable' é pra quando o intent não tem nenhuma dimensão de
// compromisso possível neste turno (nem relato, nem mudança).
// ============================================================
export const COMMITMENT_NATURES = ['report_existing_fact', 'new_or_changed_commitment', 'not_applicable'] as const;
export type CommitmentNature = (typeof COMMITMENT_NATURES)[number];

// ============================================================
// ProfessionalDecisionSignal — NÃO-autoritativo. 'candidate_contextual'
// nunca significa approval, só "há evidência contextual consistente
// de uma possível decisão do profissional". O Approval Engine futuro
// é quem valida proposta/versão/escopo/autoridade de verdade.
// ============================================================
export const PROFESSIONAL_DECISION_SIGNALS = ['none', 'candidate_contextual', 'candidate_ambiguous'] as const;
export type ProfessionalDecisionSignal = (typeof PROFESSIONAL_DECISION_SIGNALS)[number];

// ============================================================
// MissingInformation — o que falta coletar antes de decidir/responder.
// `field` é rótulo livre (nunca um enum fechado — checklist universal
// é exatamente o que NÃO queremos, ver planner/prompt.ts).
// ============================================================
export const MISSING_INFORMATION_REASONS = ['not_yet_provided', 'not_found', 'unavailable', 'not_allowed'] as const;
export type MissingInformationReason = (typeof MISSING_INFORMATION_REASONS)[number];

export type MissingInformationItem = {
  field: string;
  reason: MissingInformationReason;
  blocksProfessionalDecision: boolean;
};

// ============================================================
// EvidenceUsed — KNOW ≠ SHARE. Apontar pra uma fonte real (com
// provenance determinística) prova só que o Planner TEM o fato, nunca
// que ele está autorizado a compartilhá-lo — disclosure/visibility é
// papel do Post-model Policy Gate futuro, não deste bloco.
//
// Duas formas: um ContextFact estruturado (profissional/oportunidade/
// booking/participante externo, com field) ou uma mensagem inteira da
// conversa (conversation_message, só sourceId — nunca fatiamos uma
// mensagem em "fatos" por frase, a unidade preservada é a mensagem
// inteira, igual ao MessageProvenance que o Context Builder já usa).
// ============================================================
export type EvidenceUsed =
  | { sourceType: ContextFactSourceType; sourceId: string; field: string }
  | { sourceType: 'conversation_message'; sourceId: string };

// ============================================================
// Projeção do ContextPackage pro Planner — diferente de
// ClassificationContext (Bloco 3) de propósito: o Classifier só
// precisa saber O QUE está acontecendo (flags estruturadas bastam);
// o Planner precisa dos FATOS de verdade pra poder citar EvidenceUsed
// com provenance real e propor um draft factual. Ainda assim nunca é
// o ContextPackage inteiro renderizado como texto solto — continua
// estruturado, com as mesmas seções/ContextFact que já existem.
// ============================================================
export type PlannerMessageItem = {
  messageId: string;
  authorType: ConversationMessageAuthorType;
  text: string | null;
};

export type PlannerContext = {
  conversationId: string;
  intentClassification: IntentClassification;
  triggerMessage: PlannerMessageItem | null;
  recentMessages: PlannerMessageItem[];
  conversationType: string;
  currentState: string;
  representedProfessionalDisplayName: string | null;
  externalParticipantName: string | null;
  professional: ContextSection<ContextFact>;
  opportunity: ContextSection<ContextFact>;
  booking: ContextSection<ContextFact>;
  externalParticipant: ContextSection<ContextFact>;
};

// ============================================================
// Resultado final — PLANEJAMENTO, nunca ação.
// ============================================================
export type PlannerDecision = {
  intentClassification: IntentClassification; // pass-through do Bloco 3, imutável — o Planner nunca reclassifica
  responsePlan: ResponsePlan;
  commitmentNature: CommitmentNature;
  missingInformation: MissingInformationItem[];
  evidenceUsed: EvidenceUsed[];
  // Sempre = categorias mandatórias (só quando commitmentNature é
  // 'new_or_changed_commitment') ∪ categorias que o model propôs e o
  // código validou contra o enum. Nunca decidido livremente pelo
  // model, nunca com o model removendo uma categoria mandatória.
  requiresProfessionalDecision: boolean;
  professionalDecisionCategory: ProfessionalDecisionCategory[];
  professionalDecisionSignal: ProfessionalDecisionSignal;
  proposedResponse: string | null;
  // Tipo literal — impossível de compilar com outro valor. Fora do
  // schema que o model preenche (ele nunca vê nem escreve este
  // campo); reforçado por CHECK no banco (ver migration 0044).
  requiresProfessionalReviewBeforeSend: true;
};
