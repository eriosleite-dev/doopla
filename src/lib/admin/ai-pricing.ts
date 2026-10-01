// Painel Admin V1 — custo ESTIMADO de IA, nunca "custo real".
// ai_usage_events.cost_cents_estimate nunca é preenchida hoje (ver
// migration 0041/0042) — todo valor em dinheiro mostrado no Admin é
// calculado aqui, em TypeScript, a partir de tokens × preço por
// modelo, nunca lido pronto do banco nem gravado de volta nesta
// rodada.
//
// Tabela versionada por data efetiva: cada regra vale a partir de
// effectiveFrom (inclusive) até a próxima regra do mesmo model — assim
// uma mudança futura de preço nunca reescreve a estimativa histórica
// de uso já ocorrido antes dela.
//
// Vazia de propósito: o preço real do único modelo em uso hoje
// (gpt-5-mini, ver src/lib/intelligence/config.ts) nunca foi conferido
// contra a página oficial do provider (comentário explícito naquele
// arquivo) — mostrar um número aqui seria inventar um custo. Enquanto
// a tabela não tiver uma linha pro modelo, admin_get_ai_cost_summary
// continua contando tokens normalmente e a UI marca a parcela como
// "preço não configurado", nunca estimando em cima de um preço não
// confirmado.
export type ModelPriceRule = {
  model: string;
  // Data efetiva (YYYY-MM-DD), inclusive — usa o usage_date (dia real
  // do uso) da linha agregada, nunca a data de hoje.
  effectiveFrom: string;
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
};

export const MODEL_PRICE_TABLE: ModelPriceRule[] = [];

export type AiCostEstimate = { configured: true; costCents: number } | { configured: false };

function findEffectiveRule(model: string, usageDate: string): ModelPriceRule | null {
  const candidates = MODEL_PRICE_TABLE.filter((rule) => rule.model === model && rule.effectiveFrom <= usageDate);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, rule) => (rule.effectiveFrom > latest.effectiveFrom ? rule : latest));
}

export function estimateAiCostCents(params: {
  model: string;
  usageDate: string;
  inputTokens: number;
  outputTokens: number;
}): AiCostEstimate {
  const rule = findEffectiveRule(params.model, params.usageDate);
  if (!rule) return { configured: false };

  const costCents =
    (params.inputTokens / 1_000_000) * rule.inputCentsPerMillionTokens +
    (params.outputTokens / 1_000_000) * rule.outputCentsPerMillionTokens;

  return { configured: true, costCents };
}
