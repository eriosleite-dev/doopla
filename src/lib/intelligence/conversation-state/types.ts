import type { Intent } from '../classification';
import type { CommitmentNature, ProfessionalDecisionCategory, ResponsePlan } from '../planner';
import type { ConversationMessageAuthorType } from '@/lib/supabase/types';

// Doopla Intelligence Core v1 — Conversation State Ledger.
//
// "Próxima fase: inteligência conversacional multiturno" — snapshot
// determinístico do que já está estabelecido numa conversa, pra o
// Planner nunca re-perguntar/reabrir o que a própria janela de
// mensagens já resolveu. Calculado 100% por CÓDIGO (advance.ts) a
// partir das saídas que o Classifier e o Planner JÁ produzem por
// turno — zero chamada nova a model, zero enum novo. Nunca duplica
// memory-policy.ts (conhecimento DURÁVEL entre conversas, ligado ao
// profissional) — este snapshot é escopado à CONVERSA, descartável.
//
// Deliberadamente NÃO é um ContextFact/ContextSection genérico
// (context-builder/types.ts): um fato aqui é só um PONTEIRO pra uma
// mensagem real já presente na janela (messageId + trecho verbatim),
// nunca uma fonte de evidência nova. Se o Planner cita um fato do
// ledger, continua citando sourceType:'conversation_message' com o
// messageId apontado aqui — o enum protegido de EvidenceUsed
// (planner/plan.ts) nunca precisa de um valor novo.

// Assuntos são rastreados por Intent (vocabulário já existente do
// Classifier) — LIMITAÇÃO CONHECIDA: dois tópicos concretos diferentes
// sob o MESMO intent (ex.: dois eventos de música na mesma conversa)
// colapsam num único "assunto" aqui. Resolver isso de verdade exigiria
// extração de entidade/tópico nova, fora de escopo desta v1 — ver
// relatório da fundadora.
export type ConversationStateSubject = {
  label: Intent;
  status: 'open' | 'resolved';
  firstMessageId: string;
  lastMessageId: string;
};

// Uma entrada por ProfessionalDecisionCategory — a mais recente
// substitui a anterior (sobrescrita = correção/mudança de decisão,
// nunca uma lista de histórico). evidenceSnippet é SEMPRE um trecho
// verbatim da mensagem original (truncado pelo mesmo budget de
// context-builder), nunca um valor reextraído/parafraseado — evita
// qualquer invenção de número/condição que a mensagem não disse.
export type ConversationStateKnownFact = {
  decisionCategory: ProfessionalDecisionCategory;
  statedByAuthorType: ConversationMessageAuthorType;
  messageId: string;
  evidenceSnippet: string;
};

export type ConversationStateSnapshot = {
  subjects: ConversationStateSubject[];
  knownFacts: ConversationStateKnownFact[];
};

export const EMPTY_CONVERSATION_STATE_SNAPSHOT: ConversationStateSnapshot = {
  subjects: [],
  knownFacts: [],
};

// Entrada determinística por turno — só o que o Classifier/Planner JÁ
// produziram nesta mesma rodada (nunca um recálculo retroativo sobre
// todo o histórico).
export type ConversationStateTurnInput = {
  triggerMessageId: string;
  triggerAuthorType: ConversationMessageAuthorType;
  triggerMessageSnippet: string;
  primaryIntent: Intent;
  secondaryIntents: Intent[];
  proposedDecisionCategory: ProfessionalDecisionCategory[];
  commitmentNature: CommitmentNature;
  responsePlan: ResponsePlan;
};
