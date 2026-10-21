import type { RuntimeDisposition } from './types';

// Doopla Intelligence Core v1 — Runtime: composição pura dos três
// resultados finais (fechamento do Runtime, autorizado após
// auditoria). NUNCA uma segunda política — só nomeia a combinação de
// dois sinais já autoritativos: o outcome do Post-model Policy Gate
// (Bloco 6, sobre o CONTEÚDO real do texto) e
// requiresProfessionalReviewBeforeSend (Bloco 4, derivado do
// responsePlan final). gate.blocked sempre vence (fail-closed
// preservado); revisão exigida nunca é sobrescrita por nada aqui.
export function resolveRuntimeDisposition(
  gateOutcome: 'allowed' | 'blocked' | 'not_applicable',
  requiresProfessionalReviewBeforeSend: boolean
): RuntimeDisposition {
  if (gateOutcome === 'not_applicable') return 'not_applicable';
  if (gateOutcome === 'blocked') return 'blocked';
  return requiresProfessionalReviewBeforeSend ? 'professional_action_required' : 'auto_send_eligible';
}
