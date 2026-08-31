import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, OrchestratorRun } from '@/lib/supabase/types';
import type { OrchestratorRunFinish, OrchestratorRunStart } from './types';

// Doopla Intelligence Core v1 — observabilidade mínima. Fina camada
// sobre start_orchestrator_run/finish_orchestrator_run (migration
// 0042) — nunca grava chain of thought nem duplica conteúdo de
// conversation_messages; só metadados de execução (ver comentários da
// tabela orchestrator_runs).

export async function startOrchestratorRun(
  supabase: SupabaseClient<Database>,
  params: OrchestratorRunStart
): Promise<OrchestratorRun | null> {
  const { data, error } = await supabase.rpc('start_orchestrator_run', {
    p_conversation_id: params.conversationId,
    p_represented_professional_id: params.representedProfessionalId,
    p_actor_type: params.actorType,
    p_actor_profile_id: params.actorProfileId,
    p_external_participant_id: params.externalParticipantId,
    p_trigger_source: params.triggerSource,
    p_eligible_tools: params.eligibleTools,
  });

  if (error || !data) return null;
  return data as OrchestratorRun;
}

// Doopla Intelligence Core v1 — micro-patch isolado (auditoria de
// contratos TS -> Postgres): log_ai_usage_event nunca tinha ganhado o
// boundary is_system_caller() (migration 0051 estendeu 8 RPCs, esta
// não era uma delas) — toda chamada real do Runtime (service_role)
// falhava com not_authorized, e os 4 call sites reais (pipeline.ts x2,
// resumption.ts x2) nunca checavam {error}, então a perda de
// telemetria nunca aparecia em lugar nenhum. Migration 0055 fecha o
// contrato (p_professional_id obrigatório e validado no caminho de
// sistema); esta function fecha o lado TS: falha de logging é sempre
// OBSERVÁVEL (console.error, nunca engolida) mas NUNCA lança — separar
// "falha da operação principal" de "falha de observabilidade" é uma
// decisão explícita: perder um evento de custo/uso não é motivo pra
// derrubar um ciclo client-facing (booking/resposta), e este módulo
// não tem nenhuma outra forma barata/já existente de reportar isso sem
// esse risco (orchestrator_runs.error é semanticamente outra coisa —
// fallback de contexto do Bloco 3 — reaproveitar o mesmo campo pra
// telemetria conflaria dois tipos de degradação diferentes).
export type LogAiUsageEventParams = {
  feature: string;
  model: string;
  status: 'success' | 'error';
  conversationId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  runId?: string | null;
  // Obrigatório na prática pra qualquer chamador service_role/sistema
  // (a RPC recusa fail-closed sem isso) — opcional aqui só porque o
  // caminho authenticated (test-call.ts) nunca precisou e nunca deve
  // precisar: profile_id ali continua 100% auth.uid(), este campo é
  // ignorado pela RPC nesse caminho.
  professionalId?: string | null;
};

export type LogAiUsageEventResult = { ok: true } | { ok: false; error: string };

export async function logAiUsageEvent(
  supabase: SupabaseClient<Database>,
  params: LogAiUsageEventParams
): Promise<LogAiUsageEventResult> {
  const { error } = await supabase.rpc('log_ai_usage_event', {
    p_feature: params.feature,
    p_model: params.model,
    p_status: params.status,
    p_conversation_id: params.conversationId ?? null,
    p_input_tokens: params.inputTokens ?? null,
    p_output_tokens: params.outputTokens ?? null,
    p_run_id: params.runId ?? null,
    p_professional_id: params.professionalId ?? null,
  });

  if (error) {
    // Observável (aparece nos logs do processo/plataforma), nunca
    // lançado — ver comentário acima sobre a separação deliberada
    // entre falha de observabilidade e falha da operação principal.
    console.error(`log_ai_usage_event falhou (telemetria — ciclo principal não é afetado): ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function finishOrchestratorRun(
  supabase: SupabaseClient<Database>,
  params: OrchestratorRunFinish
): Promise<OrchestratorRun | null> {
  const { classification, plan } = params;
  const { data, error } = await supabase.rpc('finish_orchestrator_run', {
    p_run_id: params.runId,
    p_status: params.status,
    p_called_tools: params.calledTools,
    p_error: params.error,
    p_fallback_used: params.fallbackUsed,
    p_primary_intent: classification?.primaryIntent ?? null,
    p_secondary_intents: classification?.secondaryIntents ?? [],
    p_competencies: classification?.competencies ?? [],
    p_model_confidence: classification?.modelConfidence ?? null,
    p_effective_confidence: classification?.effectiveConfidence ?? null,
    p_context_completeness: classification?.contextCompleteness ?? null,
    p_classification_status: classification?.classificationStatus ?? null,
    p_response_plan: plan?.responsePlan ?? null,
    p_commitment_nature: plan?.commitmentNature ?? null,
    p_requires_professional_decision: plan?.requiresProfessionalDecision ?? null,
    p_professional_decision_category: plan?.professionalDecisionCategory ?? [],
    p_professional_decision_signal: plan?.professionalDecisionSignal ?? null,
    p_missing_information_count: plan?.missingInformationCount ?? 0,
    p_evidence_used_count: plan?.evidenceUsedCount ?? 0,
    // Sem plan (run sem planejamento nesta execução), mantém o default
    // conservador true da própria coluna — nunca assume que algo sem
    // Planner nenhum é seguro pra auto-send.
    p_requires_professional_review_before_send: plan?.requiresProfessionalReviewBeforeSend ?? true,
  });

  if (error || !data) return null;
  return data as OrchestratorRun;
}
