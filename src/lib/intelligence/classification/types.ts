import type { ConversationMessageAuthorType, ConversationMessageContentType } from '@/lib/supabase/types';
import type { Competency } from './competencies';
import type { Intent } from './intents';

// Doopla Intelligence Core v1 — Bloco 3: tipos de classificação.
//
// 'classified'/'ambiguous' são estados que o MODEL pode reportar
// (schema-válido). 'invalid' só é decidido por código, quando a
// saída do model nunca chegou a validar de verdade (parsing/schema
// falhou mesmo após retry) — nunca confundido com "outro" legítimo.
export type ClassificationStatus = 'classified' | 'ambiguous' | 'invalid';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

// not_allowed nunca conta como incompletude (a Policy Layer decidiu
// que a fonte não deveria carregar — ausência correta). partial_missing
// = fonte relevante permitida mas sem vínculo/dado. partial_unavailable
// = fonte relevante deveria estar disponível mas a consulta falhou
// (ver context-builder — nunca confundido com "não existe").
export type ContextCompleteness = 'complete' | 'partial_missing' | 'partial_unavailable';

export type SectionStatusFlag = 'loaded' | 'not_allowed' | 'no_link' | 'not_found' | 'unavailable';

// Projeção leve do ContextPackage — nunca o pacote inteiro. Só o
// necessário pra classificar: mensagem-gatilho, 1-2 anteriores,
// identidade mínima dos dois lados, tipo/estado da conversa, e flags
// ESTRUTURADAS (nunca texto) sobre fontes relevantes ausentes/
// indisponíveis. Nunca bio longa, negotiation notes, booking inteiro.
export type ClassificationContext = {
  triggerMessage: {
    authorType: ConversationMessageAuthorType;
    text: string | null;
    contentType: ConversationMessageContentType;
  } | null;
  recentMessages: Array<{ authorType: ConversationMessageAuthorType; text: string | null }>;
  conversationType: string;
  currentState: string;
  externalParticipant: { name: string | null } | null;
  representedProfessional: { displayName: string } | null;
  sectionStatus: {
    opportunity: SectionStatusFlag;
    booking: SectionStatusFlag;
    externalParticipant: SectionStatusFlag;
  };
};

// Resultado final — PERCEPÇÃO, nunca ação. Nenhum campo de tool,
// action, approval, state transition, response ou message pode
// existir aqui (estrutural, não uma convenção a lembrar).
export type IntentClassification = {
  classificationStatus: ClassificationStatus;
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  // Autoavaliação do model, nunca ajustada — a autoridade real é
  // effectiveConfidence.
  modelConfidence: ConfidenceLevel;
  // Valor autoritativo consumido pelo resto do sistema. Só pode ser
  // igual ou mais baixo que modelConfidence — nunca mais alto (ver
  // classification/confidence.ts).
  effectiveConfidence: ConfidenceLevel;
  contextCompleteness: ContextCompleteness;
  // Preenchido só pelo CompetenceRouter (código), nunca pelo model.
  relevantCompetencies: Competency[];
};
