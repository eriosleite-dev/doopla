// ADR 0007 item 5 — tipos e agregação PURA (zero I/O, zero 'use
// server'), usados tanto pela Server Action (runPlannerGoldenSuiteBatchAction,
// actions.ts) quanto pelo Panel.tsx ('use client') pra montar o
// resumo final a partir de vários lotes. Um arquivo 'use server' só
// pode exportar funções assíncronas tratadas como Server Actions —
// por isso esta agregação pura precisa viver fora de actions.ts pra
// ser importável direto no client.

export type PlannerGoldenSuiteCaseResult = {
  name: string;
  category: string;
  input: string;
  responsePlan: string;
  commitmentNature: string;
  requiresProfessionalDecision: boolean;
  professionalDecisionCategory: string[];
  professionalDecisionSignal: string;
  requiresProfessionalReviewBeforeSend: boolean;
  proposedResponse: string | null;
  pass: boolean;
  note?: string;
  error?: string;
  plannerInputTokens: number | null;
  plannerOutputTokens: number | null;
  plannerCachedInputTokens: number;
  plannerCostCents: number | null;
  plannerLatencyMs: number;
};

export type PlannerGoldenSuiteRunSummary = {
  model: string;
  totalPlannerInputTokens: number;
  totalPlannerOutputTokens: number;
  totalPlannerCachedInputTokens: number;
  totalPlannerCostCents: number | null;
  costConfigured: boolean;
  totalLatencyMs: number;
  averageLatencyMs: number;
};

// Agrega os resultados de TODOS os lotes já recebidos (nunca só o
// último) — chamado de novo a cada lote que chega, com o array
// acumulado inteiro, nunca incremental sobre o resumo anterior (evita
// bug de soma duplicada se o cliente reconstruir a lista por engano).
export function buildRunSummary(model: string, results: readonly PlannerGoldenSuiteCaseResult[]): PlannerGoldenSuiteRunSummary {
  let totalPlannerInputTokens = 0;
  let totalPlannerOutputTokens = 0;
  let totalPlannerCachedInputTokens = 0;
  let totalPlannerCostCents = 0;
  let costConfigured = true;
  let totalLatencyMs = 0;

  for (const r of results) {
    totalLatencyMs += r.plannerLatencyMs;
    totalPlannerCachedInputTokens += r.plannerCachedInputTokens;
    if (r.plannerInputTokens !== null && r.plannerOutputTokens !== null) {
      totalPlannerInputTokens += r.plannerInputTokens;
      totalPlannerOutputTokens += r.plannerOutputTokens;
    }
    if (r.plannerCostCents !== null) {
      totalPlannerCostCents += r.plannerCostCents;
    } else if (r.plannerInputTokens !== null) {
      // Teve tokens reais mas nenhum preço cadastrado -- nunca finge
      // um total confiável a partir daqui.
      costConfigured = false;
    }
  }

  return {
    model,
    totalPlannerInputTokens,
    totalPlannerOutputTokens,
    totalPlannerCachedInputTokens,
    totalPlannerCostCents: costConfigured ? totalPlannerCostCents : null,
    costConfigured,
    totalLatencyMs,
    averageLatencyMs: results.length > 0 ? totalLatencyMs / results.length : 0,
  };
}
