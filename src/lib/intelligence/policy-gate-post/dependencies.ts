import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — Post-model Policy Gate: matriz de
// dependência entre categorias (decisão do usuário, fechamento do
// Gate). Estática, hand-curated — mesmo padrão de
// INTENT_MANDATORY_DECISION_CATEGORIES (planner/decision-categories.ts).
// Nunca ampliada por inferência do model; categorias sem entrada aqui
// NUNCA geram invalidação por dependência.
//
// Princípio: uma aprovação só continua válida enquanto as premissas
// comerciais relevantes sob as quais ela foi dada continuarem
// aplicáveis. Se uma categoria da qual esta depende tiver uma
// aprovação MAIS RECENTE (created_at posterior), a premissa pode ter
// mudado — a aprovação dependente fica inaplicável (stale_dependency),
// mesmo que o próprio valor dela nunca tenha sido superseded.
//
// contractual_exception/other_commitment_change ficam de fora: a
// dependência delas varia por conteúdo (subject_key/descrição livre),
// não é generalizável com segurança numa tabela estática — nunca
// inventamos uma regra pra elas.
export const CATEGORY_DEPENDENCIES: Partial<Record<ProfessionalDecisionCategory, readonly ProfessionalDecisionCategory[]>> = {
  price_or_cache: ['date_change', 'time_change', 'duration_change', 'location_change', 'scope_change'],
  discount: ['price_or_cache'],
  payment_condition: ['price_or_cache'],
  accept_or_decline_work: ['date_change', 'time_change', 'duration_change', 'location_change', 'scope_change'],
  logistics_commitment: ['date_change', 'location_change'],
};
