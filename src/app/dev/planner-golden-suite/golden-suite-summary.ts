// ADR 0007 item 5 — tipos e agregação PURA (zero I/O, zero 'use
// server'), usados tanto pela Server Action (runPlannerGoldenSuiteBatchAction,
// actions.ts) quanto pelo Panel.tsx ('use client') pra montar o
// resumo final a partir de vários lotes. Um arquivo 'use server' só
// pode exportar funções assíncronas tratadas como Server Actions —
// por isso esta agregação pura precisa viver fora de actions.ts pra
// ser importável direto no client.

import type { IntentClassification } from '@/lib/intelligence/classification';

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
  // Task "Próxima etapa da avaliação do cérebro Doopla" (20/10/2026),
  // requisito 3: registrar a saída do Classifier junto de cada
  // repetição — nunca só o resultado final do Planner — pra dar pra
  // diferenciar "o Classifier variou" de "o Planner variou". `classification`
  // é o objeto completo (serializável), reusável como `fixedClassifications`
  // numa chamada seguinte pra isolar o Planner. `classificationSource`
  // diz se esta repetição chamou o Classifier de verdade ou reusou uma
  // classificação já fixada por uma repetição anterior.
  classification: IntentClassification;
  classificationSource: 'computed' | 'fixed';
  // reasoning.effort/context EFETIVOS, lidos de volta da resposta da
  // própria API (nunca só da documentação do SDK) — requisito
  // explícito: "não quero atribuir diferenças de qualidade ou latência
  // a uma configuração ainda não comprovada". null quando o model não
  // devolve o campo (ou quando a classificação foi reusada/fixada,
  // caso em que o Classifier nem foi chamado nesta repetição).
  plannerReasoningEffort: string | null;
  plannerReasoningContext: string | null;
  classifierReasoningEffort: string | null;
  classifierReasoningContext: string | null;
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
