import type { PlannerDecision, ResponsePlan } from '../intelligence/planner';

// Doopla Intelligence Core v1 — Beta Instrumentation: critérios
// determinísticos dos Value Events. Funções puras (sem supabase),
// mesmo espírito de planner/invariants.ts — cada uma só compõe sinais
// que o Runtime já calculou, nunca interpreta nada novo.
//
// Nunca "mensagem enviada" = valor por si só (decisão do usuário) —
// cada evento prova um RESULTADO OPERACIONAL verificável, não uma ação
// da Doopla sozinha.

// value.decision_prepared — a Doopla montou uma decisão pronta pro
// profissional decidir, nunca só "preciso que você decida" vazio.
export function evaluateDecisionPrepared(
  decision: Pick<PlannerDecision, 'responsePlan' | 'requiresProfessionalDecision' | 'professionalDecisionCategory' | 'proposedResponse' | 'missingInformation'>
): boolean {
  if (decision.responsePlan !== 'consult_professional') return false;
  if (!decision.requiresProfessionalDecision) return false;
  if (decision.professionalDecisionCategory.length === 0) return false;
  if (!decision.proposedResponse) return false;
  // Nada pode estar bloqueando a decisão — "pronta" significa pronta de
  // verdade, não pela metade.
  if (decision.missingInformation.some((m) => m.blocksProfessionalDecision)) return false;
  return true;
}

// value.meaningful_client_action — a Doopla executou uma ação
// client-facing REAL e validada, sem precisar do profissional. Prova
// só EXECUÇÃO (o fato observado), nunca "avanço" de estado — nome
// escolhido de propósito pra não alegar algo que não temos evidência
// de ter acontecido (decisão do usuário).
export function evaluateMeaningfulClientAction(params: {
  responsePlan: ResponsePlan;
  gateOutcome: 'allowed' | 'blocked' | 'not_applicable';
  outboundIntentCreated: boolean;
  recipientType: 'external_participant' | 'professional' | null;
}): boolean {
  if (params.responsePlan !== 'ask_external_participant' && params.responsePlan !== 'answer_with_known_information') return false;
  if (params.gateOutcome !== 'allowed') return false;
  if (!params.outboundIntentCreated) return false;
  if (params.recipientType !== 'external_participant') return false;
  return true;
}

// value.operational_task_resolved — avaliado diretamente no ponto de
// transição de runtime_pending_replies pra 'completed' via claim
// (result.claimed === true) — sem função pura própria: o critério É a
// transição em si (resolve_runtime_pending_reply_allowed, migration
// 0053), nenhuma composição adicional de sinais.

// value.booking_closed / product.booking_closed — avaliados dentro da
// RPC record_booking_closed_event (migration 0065), nunca em TS: a
// checagem de correlação Doopla<->booking precisa rodar com privilégio
// elevado (quem aceita o booking pode ser o booker, sem RLS de leitura
// sobre conversations/orchestrator_runs do artista) — ver comentário na
// própria função SQL.
