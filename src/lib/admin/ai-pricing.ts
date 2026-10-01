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
// Preço do único modelo em uso hoje (gpt-5-mini) confirmado pela
// fundadora em 01/10/2026 contra o tier padrão (síncrono, sem Batch
// API/service_tier — confirmado em código: getOpenAIClient() nunca
// passa service_tier, nenhum client.batches.* existe no projeto) da
// API oficial da OpenAI: input US$0,25/1M tokens, output US$2,00/1M
// tokens. effectiveFrom em 2025-01-01 (antes de qualquer uso real
// registrado) porque não houve mudança de preço conhecida durante
// este beta — uma mudança futura confirmada vira uma LINHA NOVA com
// effectiveFrom na data real da mudança, nunca uma edição da linha
// existente (isso reescreveria a estimativa de uso já ocorrido).
//
// Sem desconto de cached input: a resposta da OpenAI (Responses API)
// expõe `usage.input_tokens_details.cached_tokens`, mas o projeto
// nunca lê nem grava esse campo (confirmado: zero ocorrência de
// "cached_tokens"/"input_tokens_details" em todo o código) —
// `ai_usage_events.input_tokens` é sempre o total (cache + não-cache
// misturados, sem separação). Aplicar o preço de cache aqui seria
// inventar um desconto sobre um dado que não temos; por isso o cálculo
// usa sempre o preço de input cheio sobre o total.
export type ModelPriceRule = {
  model: string;
  // Data efetiva (YYYY-MM-DD), inclusive — usa o usage_date (dia real
  // do uso) da linha agregada, nunca a data de hoje.
  effectiveFrom: string;
  inputCentsPerMillionTokens: number;
  outputCentsPerMillionTokens: number;
};

export const MODEL_PRICE_TABLE: ModelPriceRule[] = [
  { model: 'gpt-5-mini', effectiveFrom: '2025-01-01', inputCentsPerMillionTokens: 25, outputCentsPerMillionTokens: 200 },
];

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
