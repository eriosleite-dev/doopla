'use server';

import { redirect } from 'next/navigation';
import { zodTextFormat } from 'openai/helpers/zod';

import { createClient } from '@/lib/supabase/server';
import { classifyIntent } from '@/lib/intelligence/classification';
import type { ContextFact, ContextPackage, MessageContextItem } from '@/lib/intelligence/context-builder';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { planResponse, plannerModelOutputSchema, resolveRequiresProfessionalReviewBeforeSend, PLANNER_GOLDEN_SUITE_CASES } from '@/lib/intelligence/planner';
import type { PlannerGoldenSuiteCase, PlannerModelCall } from '@/lib/intelligence/planner';
import type { ActorContext, MinimalConversation, ToolContext } from '@/lib/intelligence/types';
import { estimateAiCostCents } from '@/lib/admin/ai-pricing';
import type { PlannerGoldenSuiteCaseResult } from './golden-suite-summary';

// Ferramenta de desenvolvimento/teste — não é parte do produto. Mesmo
// padrão de /dev/classification-golden-suite: checagem de sessão
// própria, zero pegada em banco (ContextPackage/MinimalConversation
// sintéticos em memória), classifyIntent()/planResponse() nunca tocam
// supabase.from()/.rpc() (prova estrutural, coberta em teste
// determinístico). A única chamada de rede real é ao model, pela
// mesma abstração já auditada.
//
// ADR 0007 item 5 (comparação de modelos, 20/10/2026) — model é
// parametrizável nesta ferramenta SEM tocar o pipeline real: plan.ts
// já aceita um modelCall injetável (mesmo ponto usado pelos testes
// determinísticos), nunca precisou mudar PLANNER_MODEL em produção.
// Zero mudança estrutural, zero flag, zero migration — só esta
// ferramenta de dev passa a chamar o model escolhido em vez do
// hardcoded. Custo é SEMPRE estimativa (mesmo raciocínio de
// ai-pricing.ts): tokens reais da chamada × preço cadastrado pro
// model; um model sem linha em MODEL_PRICE_TABLE devolve
// costCents=null, nunca inventa um preço.

// ADR 0007 item 5 — métricas que PlannerModelCallResult (contrato
// fixo de plan.ts, produção) não carrega: latência real e tokens
// servidos do cache da própria OpenAI. Acumuladas num objeto
// mutável passado por fora, nunca no retorno — nunca precisou mudar o
// tipo de produção pra isto. Soma de TODAS as tentativas (planResponse
// pode chamar modelCall mais de uma vez num retry), mesmo princípio já
// usado pra tokens no resto do projeto.
type ModelCallMetrics = { cachedInputTokens: number; latencyMs: number };

function buildModelCallForModel(model: string, metrics: ModelCallMetrics): PlannerModelCall {
  return async ({ instructions, input }) => {
    const client = getOpenAIClient();
    const startedAt = Date.now();
    const response = await client.responses.parse({
      model,
      instructions,
      input,
      text: { format: zodTextFormat(plannerModelOutputSchema, 'response_plan') },
    });
    metrics.latencyMs += Date.now() - startedAt;
    metrics.cachedInputTokens += response.usage?.input_tokens_details?.cached_tokens ?? 0;
    return {
      parsed: response.output_parsed ?? null,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  };
}

// ADR 0007 item 5 — "verificar disponibilidade do model na conta antes
// de executar" (requisito explícito da fundadora): GET real na API da
// OpenAI (models.retrieve), nunca uma suposição a partir do nome. Erro
// de rede/chave/qualquer coisa também vira available:false — quem usa
// isto nunca deve rodar a suite inteira (26 casos reais) achando que
// um erro de disponibilidade era só uma falha pontual.
export async function checkModelAvailabilityAction(model: string): Promise<{ available: boolean; error?: string }> {
  await requireProfessional();
  const trimmedModel = model.trim();
  if (trimmedModel.length === 0) return { available: false, error: 'model_required' };

  try {
    const client = getOpenAIClient();
    await client.models.retrieve(trimmedModel);
    return { available: true };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : 'erro desconhecido ao verificar disponibilidade' };
  }
}

// Execução em lotes (20/10/2026) — achado real em produção nesta
// MESMA sessão (ver admin/conversation-scenarios/actions.ts pro
// precedente exato): rodar os 26 casos reais numa Server Action só
// trava a página sem nunca voltar, estourando o limite de execução da
// plataforma (mesma causa estrutural já documentada ali — soma de
// chamadas sequenciais reais à OpenAI, cresce com o número de casos).
// listPlannerGoldenSuiteCasesAction devolve só os nomes (leve, sem
// chamada ao model) pra o cliente montar os lotes; cada lote roda os
// casos que o cliente escolher, nunca a suite inteira de uma vez.
export async function listPlannerGoldenSuiteCasesAction(): Promise<{ cases: { name: string }[] }> {
  await requireProfessional();
  return { cases: PLANNER_GOLDEN_SUITE_CASES.map((c) => ({ name: c.name })) };
}

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/planner-golden-suite');
  return { supabase, user };
}

function factsFromRecord(
  sourceType: 'opportunity' | 'booking',
  sourceId: string,
  record: Record<string, string | number | boolean>,
  loadedAt: string
): ContextFact[] {
  return Object.entries(record).map(([field, value]) => ({
    sourceType,
    sourceId,
    field,
    value,
    factType: 'structured' as const,
    loadedAt,
  }));
}

function buildSyntheticContext(
  goldenCase: PlannerGoldenSuiteCase,
  professionalId: string
): { contextPackage: ContextPackage; conversation: MinimalConversation } {
  const conversation: MinimalConversation = {
    id: 'planner-golden-suite-synthetic',
    represented_professional_id: professionalId,
    mandate: 'active',
    status: 'open',
    current_state: 'novo',
    conversation_type: 'external_inquiry',
    external_participant_id: null,
    related_opportunity_id: null,
    related_booking_id: null,
  };

  const now = new Date().toISOString();
  const previousItems: MessageContextItem[] = (goldenCase.previousMessages ?? []).map((m, i) => ({
    messageId: `planner-golden-suite-previous-${i}`,
    createdAt: now,
    authorType: m.authorType,
    direction: m.authorType === 'external_participant' ? 'inbound' : 'outbound',
    contentType: 'text',
    text: m.text,
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: `planner-golden-suite-previous-${i}` },
  }));
  const triggerItem: MessageContextItem = {
    messageId: 'planner-golden-suite-trigger',
    createdAt: now,
    authorType: goldenCase.triggerAuthorType ?? 'external_participant',
    direction: (goldenCase.triggerAuthorType ?? 'external_participant') === 'external_participant' ? 'inbound' : 'outbound',
    contentType: 'text',
    text: goldenCase.input,
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: 'planner-golden-suite-trigger' },
  };
  const items = [...previousItems, triggerItem];

  const contextPackage: ContextPackage = {
    conversationId: conversation.id,
    representedProfessionalId: professionalId,
    builtAt: now,
    professional: { status: 'loaded', facts: [] },
    professionalBusinessContext: { status: 'loaded', facts: [] },
    professionalCommercialHistory: { status: 'loaded', facts: [], retrievalStrategy: 'recency_bounded_v1', limit: 5 },
    professionalLearnedPreferences: { status: 'loaded', facts: [] },
    messages: { status: 'loaded', items, windowMessageCount: items.length, windowSince: now },
    opportunity: goldenCase.opportunityFacts
      ? { status: 'loaded', facts: factsFromRecord('opportunity', 'planner-golden-suite-opportunity', goldenCase.opportunityFacts, now) }
      : { status: 'no_link' },
    booking: goldenCase.bookingFacts
      ? { status: 'loaded', facts: factsFromRecord('booking', 'planner-golden-suite-booking', goldenCase.bookingFacts, now) }
      : { status: 'no_link' },
    externalParticipant: { status: 'no_link' },
  };

  return { contextPackage, conversation };
}

// Roda só os casos cujo `name` está em caseNames, na ordem de
// PLANNER_GOLDEN_SUITE_CASES — nunca a suite inteira (ver comentário
// de listPlannerGoldenSuiteCasesAction acima). O cliente é quem decide
// o tamanho do lote e agrega os resultados entre chamadas.
export async function runPlannerGoldenSuiteBatchAction(
  model: string,
  caseNames: string[]
): Promise<{ results?: PlannerGoldenSuiteCaseResult[]; error?: string }> {
  const { supabase, user } = await requireProfessional();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const trimmedModel = model.trim();
  if (trimmedModel.length === 0) return { error: 'model_required' };

  const caseNameSet = new Set(caseNames);
  const casesToRun = PLANNER_GOLDEN_SUITE_CASES.filter((c) => caseNameSet.has(c.name));
  if (casesToRun.length !== caseNames.length) return { error: 'unknown_case_name' };

  const actorContext: ActorContext = {
    representedProfessionalId: user.id,
    actorType: 'professional',
    actorProfileId: user.id,
    capabilities: ['read_professional_profile', 'read_opportunity', 'read_booking', 'read_external_participant'],
    triggerSource: 'dev_test_panel',
  };

  const results: PlannerGoldenSuiteCaseResult[] = [];
  const usageDate = new Date().toISOString().slice(0, 10);

  for (const goldenCase of casesToRun) {
    const { contextPackage, conversation } = buildSyntheticContext(goldenCase, user.id);
    const toolCtx: ToolContext = {
      representedProfessionalId: user.id,
      actorContext,
      conversation,
      supabase,
    };

    const metrics: ModelCallMetrics = { cachedInputTokens: 0, latencyMs: 0 };
    try {
      const { classification } = await classifyIntent(toolCtx, contextPackage);
      const { decision, inputTokens, outputTokens } = await planResponse(toolCtx, contextPackage, classification, { modelCall: buildModelCallForModel(trimmedModel, metrics) });

      let plannerCostCents: number | null = null;
      if (inputTokens !== null && outputTokens !== null) {
        const estimate = estimateAiCostCents({ model: trimmedModel, usageDate, inputTokens, outputTokens, cachedInputTokens: metrics.cachedInputTokens });
        if (estimate.configured) {
          plannerCostCents = estimate.costCents;
        } else {
          // Sem preço cadastrado — nunca inventa um valor;
          // buildRunSummary (golden-suite-summary.ts, cliente) agrega
          // costConfigured=false quando QUALQUER caso vier com
          // plannerCostCents=null.
        }
      }

      const planMatches = (goldenCase.expectedResponsePlanFamily as string[]).includes(decision.responsePlan);
      const commitmentMatches = !goldenCase.expectedCommitmentNature || decision.commitmentNature === goldenCase.expectedCommitmentNature;
      const requiresDecisionMatches =
        goldenCase.expectedRequiresProfessionalDecision === undefined ||
        decision.requiresProfessionalDecision === goldenCase.expectedRequiresProfessionalDecision;
      const signalMatches =
        !goldenCase.expectedProfessionalDecisionSignal || decision.professionalDecisionSignal === goldenCase.expectedProfessionalDecisionSignal;
      // Invariante checada em TODO caso, não só nos de controle:
      // requiresProfessionalReviewBeforeSend precisa bater EXATAMENTE
      // com a derivação determinística de invariants.ts a partir do
      // responsePlan final — nunca true incondicional (decisão do
      // usuário, fechamento do Runtime: consult_professional/
      // answer_with_known_information exigem revisão, os 4 planos
      // restantes não, mas o Post-model Policy Gate continua sendo o
      // enforcement final independente disso).
      const invariantHolds = decision.requiresProfessionalReviewBeforeSend === resolveRequiresProfessionalReviewBeforeSend(decision.responsePlan);

      const pass = planMatches && commitmentMatches && requiresDecisionMatches && signalMatches && invariantHolds;

      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        responsePlan: decision.responsePlan,
        commitmentNature: decision.commitmentNature,
        requiresProfessionalDecision: decision.requiresProfessionalDecision,
        professionalDecisionCategory: decision.professionalDecisionCategory,
        professionalDecisionSignal: decision.professionalDecisionSignal,
        requiresProfessionalReviewBeforeSend: decision.requiresProfessionalReviewBeforeSend,
        proposedResponse: decision.proposedResponse,
        pass,
        note: goldenCase.note,
        plannerInputTokens: inputTokens,
        plannerOutputTokens: outputTokens,
        plannerCachedInputTokens: metrics.cachedInputTokens,
        plannerCostCents,
        plannerLatencyMs: metrics.latencyMs,
      });
    } catch (err) {
      // Latência/cache registrados mesmo em erro — uma tentativa real
      // pode ter chegado a sair (e demorar) antes de o ciclo falhar
      // por outro motivo (ex.: guarda de invariante).
      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        responsePlan: 'erro',
        commitmentNature: 'erro',
        requiresProfessionalDecision: true,
        professionalDecisionCategory: [],
        professionalDecisionSignal: 'none',
        requiresProfessionalReviewBeforeSend: true,
        proposedResponse: null,
        pass: false,
        note: goldenCase.note,
        error: err instanceof Error ? err.message : 'erro desconhecido',
        plannerInputTokens: null,
        plannerOutputTokens: null,
        plannerCachedInputTokens: metrics.cachedInputTokens,
        plannerCostCents: null,
        plannerLatencyMs: metrics.latencyMs,
      });
    }
  }

  return { results };
}
