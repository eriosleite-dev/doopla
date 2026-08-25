import type { Intent } from '../classification';

// Doopla Intelligence Core v1 — Bloco 4: categorias de decisão do
// profissional.
//
// KNOW ≠ APPROVE ≠ COMMIT. Nenhuma destas categorias, por si só,
// autoriza nada — só descreve QUE TIPO de compromisso está em jogo
// quando o turno de fato tenta criar/alterar um.
export const PROFESSIONAL_DECISION_CATEGORIES = [
  'accept_or_decline_work',
  'price_or_cache',
  'discount',
  'payment_condition',
  'date_change',
  'time_change',
  'duration_change',
  'location_change',
  'scope_change',
  'logistics_commitment',
  'cancellation',
  'contractual_exception',
  'other_commitment_change',
] as const;

export type ProfessionalDecisionCategory = (typeof PROFESSIONAL_DECISION_CATEGORIES)[number];

// INTENT ≠ DECISION: esta tabela NÃO significa "todo turno deste
// intent exige decisão nova" — significa "quando o turno É de fato
// uma tentativa de criar/alterar compromisso (commitmentNature =
// 'new_or_changed_commitment', ver invariants.ts), estas categorias
// são obrigatórias pra esse intent". Só entram aqui categorias
// inerentes à própria definição do intent no Bloco 3 (nunca "na
// maioria dos casos") — orcamento/disponibilidade/desconto/
// condicao_pagamento são, por definição, sempre sobre uma negociação
// prospectiva (ver classification/prompt.ts), nunca sobre relatar um
// fato já resolvido. Os demais intents ficam vazios aqui de propósito
// — não porque nunca envolvem compromisso (ex.: "pode mudar o hotel
// pra 1h30 do evento?" sob logistica claramente envolve), mas porque
// isso depende do conteúdo concreto da mensagem, não do intent em si.
// Nesses casos o model pode PROPOR uma categoria (campo próprio no
// schema do model, nunca este aqui) — o código só valida contra o
// enum acima e faz união; nunca aceita um valor fora dele, e nunca
// permite que o model remova o que está aqui embaixo.
export const INTENT_MANDATORY_DECISION_CATEGORIES: Record<Intent, readonly ProfessionalDecisionCategory[]> = {
  orcamento: ['accept_or_decline_work', 'price_or_cache'],
  disponibilidade: ['accept_or_decline_work'],
  desconto: ['discount'],
  condicao_pagamento: ['payment_condition'],
  logistica: [],
  rider: [],
  contrato: [],
  cobranca: [],
  material_profissional: [],
  reclamacao: [],
  suporte: [],
  booking_update: [],
  financeiro_booking: [],
  treinamento_profissional: [],
  outro: [],
};
