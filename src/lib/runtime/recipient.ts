import type { ResponsePlan } from '../intelligence/planner';

// Doopla Intelligence Core v1 — Runtime: pra quem o proposedResponse
// deste ciclo é endereçado, e qual caminho de persistência usar.
// 100% código puro, testável isoladamente — extraído de pipeline.ts.
//
// Correção desta rodada (bug encontrado na implementação original):
// NUNCA só conversation_type. Uma conversa 'professional_self' nunca
// fala com ninguém além do profissional. Mas dentro de uma conversa
// 'external_inquiry', o responsePlan FINAL decide:
// responsePlan='consult_professional' é dirigido ao PRÓPRIO
// PROFISSIONAL (prompt.ts: "o draft deve ser uma pergunta clara ao
// profissional"), nunca ao cliente sem decisão. Todos os outros planos
// falam com o participante externo.
export function resolveRecipientType(conversationType: string, responsePlan: ResponsePlan): 'external_participant' | 'professional' {
  return conversationType === 'professional_self' || responsePlan === 'consult_professional' ? 'professional' : 'external_participant';
}

// Aprovação (Bloco 5) só roda quando a mensagem-gatilho DESTE ciclo é
// um enunciado do PRÓPRIO PROFISSIONAL sobre um commercial root já
// existente — Approval Engine resolve enunciados do profissional,
// nunca mensagens do cliente (cliente "propondo" ou "fechando" um
// valor nunca cria approval, por mais inequívoco que pareça — só o
// profissional tem autoridade). Extraído de pipeline.ts pra ser
// testável isoladamente.
export function shouldRunApprovalEngine(authorType: 'external_participant' | 'professional', hasCommercialRoot: boolean): boolean {
  return authorType === 'professional' && hasCommercialRoot;
}

export type OutboundAction = 'create_outbound_intent' | 'persist_ai_message' | 'none';

// O que fazer com um draft já avaliado pelo Post-model Gate.
// create_outbound_intent é exclusivo de external_participant — nunca
// pro profissional (outbound_intents é só canal externo real, com
// provider). persist_ai_message é exclusivo de professional — nunca
// pro cliente (sem provider entre a Doopla e o próprio app do
// profissional). 'none' cobre: outcome não-allowed (nada a persistir —
// applyGateOutcome já zerou proposedResponse), ou external_participant
// sem external_participant_id vinculado ainda (nunca deveria ocorrer
// em teoria — recipientType='external_participant' só é escolhido
// quando já existe um draft pro cliente, e author_type=external_participant
// sempre vincula o participante antes; guarda defensiva mesmo assim,
// nunca assume).
export function resolveOutboundAction(
  recipientType: 'external_participant' | 'professional',
  gateOutcome: 'allowed' | 'blocked' | 'not_applicable',
  hasExternalParticipantId: boolean
): OutboundAction {
  if (gateOutcome !== 'allowed') return 'none';
  if (recipientType === 'professional') return 'persist_ai_message';
  return hasExternalParticipantId ? 'create_outbound_intent' : 'none';
}
