import type { Intent } from './intents';

// Doopla Intelligence Core v1 — Bloco 3: Competence Router.
//
// O model classifica intenção; ele NUNCA escolhe competência — isso é
// sempre um mapeamento determinístico em código. As 7 competências são
// as já aprovadas na arquitetura (rótulos internos, nunca "agentes"
// ou personalidades separadas).
export const COMPETENCIES = [
  'comercial_negociacao',
  'producao',
  'logistica',
  'financeiro',
  'materiais_marketing',
  'relacionamento',
  'suporte',
] as const;

export type Competency = (typeof COMPETENCIES)[number];

// Mapeamento intent -> competências. Proposta inicial (decisão de
// produto, não técnica) — ajustar é editar esta tabela, nunca uma
// instrução de prompt. O model nunca vê nem influencia isto.
const INTENT_COMPETENCIES: Record<Intent, readonly Competency[]> = {
  orcamento: ['comercial_negociacao'],
  disponibilidade: ['logistica', 'comercial_negociacao'],
  desconto: ['comercial_negociacao', 'financeiro'],
  condicao_pagamento: ['financeiro'],
  logistica: ['logistica'],
  rider: ['producao', 'logistica'],
  contrato: ['comercial_negociacao', 'financeiro'],
  cobranca: ['financeiro'],
  material_profissional: ['materiais_marketing'],
  reclamacao: ['relacionamento', 'suporte'],
  suporte: ['suporte'],
  booking_update: ['comercial_negociacao', 'producao'],
  // Estado/acontecimento financeiro de um trabalho já existente — só
  // financeiro, nunca comercial_negociacao (não há negociação
  // acontecendo, só relato de fato) nem producao.
  financeiro_booking: ['financeiro'],
  treinamento_profissional: ['suporte', 'relacionamento'],
  outro: [],
};

// União determinística: mesma ordem sempre (a ordem de COMPETENCIES),
// nunca a ordem de inserção/aparição dos intents — "determinística" no
// sentido forte, não só "sem duplicata".
export function routeCompetencies(intents: readonly Intent[]): Competency[] {
  const selected = new Set<Competency>();
  for (const intent of intents) {
    // `?? []` é defesa em profundidade: um Intent fora do vocabulário
    // nunca deveria chegar aqui (o zod já barra isso antes), mas se
    // chegasse, nunca pode virar uma exceção nem uma competência
    // inventada — só é ignorado.
    for (const competency of INTENT_COMPETENCIES[intent] ?? []) {
      selected.add(competency);
    }
  }
  return COMPETENCIES.filter((c) => selected.has(c));
}
