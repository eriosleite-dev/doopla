import type { PlannerDecision } from '../planner';
import type { PostModelGateResult } from './types';

// Doopla Intelligence Core v1 — Post-model Policy Gate: transformação
// pós-bloqueio.
//
// Anti policy-laundering (item 12 da spec do usuário): quando o Gate
// bloqueia, o resultado NUNCA volta pro mesmo model call como "sua
// mensagem foi bloqueada, tente de novo" — isso convidaria o model a
// reformular até escapar da checagem. A única transformação permitida
// é determinística, em código, e só pode tornar o resultado MAIS
// conservador (mesmo espírito de planner/invariants.ts:
// resolveResponsePlan) — nunca uma segunda chamada ao model dentro do
// mesmo turno.
//
// Reaproveita o próprio ResponsePlan já existente do Bloco 4
// ('consult_professional') em vez de inventar um estado novo — o
// profissional revisa e decide, exatamente o caminho que já existe
// pra qualquer decisão sem autoridade suficiente.
export function applyGateOutcome(decision: PlannerDecision, gateResult: PostModelGateResult): PlannerDecision {
  if (gateResult.outcome === 'allowed') return decision;

  return {
    ...decision,
    responsePlan: 'consult_professional',
    // Mesmo padrão de plan.ts (draftStillValid): um draft que não pode
    // sair como está nunca é reaproveitado fora do contexto pra que
    // foi escrito.
    proposedResponse: null,
  };
}
