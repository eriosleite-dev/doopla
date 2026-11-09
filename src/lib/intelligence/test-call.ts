import { createClient } from '@/lib/supabase/server';
import { resolveActorContext } from './actor-context';
import { classifyIntent, AI_FEATURE_INTENT_CLASSIFICATION } from './classification';
import type { IntentClassification } from './classification';
import { AI_FEATURE_INTELLIGENCE_TEST, AI_MODEL } from './config';
import { buildContextPackage, renderContextForPrompt, resolveProfessionalDisplayName } from './context-builder';
import { getOpenAIClient } from './openai-client';
import { finishOrchestratorRun, startOrchestratorRun } from './observability';
import { AI_FEATURE_RESPONSE_PLANNING, planResponse } from './planner';
import type { PlannerDecision } from './planner';
import { evaluatePreModelGate } from './policy-gate';
import './tools';
import type { ToolContext } from './types';

export type IntelligenceTestResult =
  | {
      ok: true;
      responseText: string;
      inputTokens: number | null;
      outputTokens: number | null;
      classification: IntentClassification;
      plan: PlannerDecision;
    }
  | { ok: false; error: string; detail?: string };

// Instrução mínima só pra provar a integração — NÃO é o system prompt
// definitivo da Doopla (isso é trabalho do Response Planner, ainda
// não construído). Deixa explícito: modo de teste, só usa o contexto
// dado, nunca inventa, sem autorização pra agir, pede pro profissional
// quando falta informação.
function buildTestInstructions(representedName: string): string {
  return `Você é a Doopla, representando ${representedName}. Você está rodando em MODO DE TESTE de infraestrutura — isto não é uma conversa real com um cliente e sua resposta não será enviada a ninguém.

Regras deste modo de teste:
- Use só o contexto fornecido abaixo. Nunca invente informação que não foi dada a você.
- Você não tem autorização pra executar nenhuma ação (negociar, confirmar valor, marcar compromisso, gerar contrato, etc.) — só pode responder em texto.
- Se faltar uma informação importante pra responder bem, diga claramente que precisaria consultar o profissional antes, em vez de supor.`;
}

// Função interna de teste — NÃO é o Orchestrator completo (sem
// post-model gate, Approval Engine). Prova que ActorContext,
// pre-model gate, Context Builder v1, Intent Classifier + Competence
// Router (Bloco 3) e Response Planner (Bloco 4, dry-run) já rodam de
// ponta a ponta antes de qualquer chamada à OpenAI que produza texto
// pro profissional testar. Classificação e planejamento são
// percepção/planejamento — o resultado é retornado/registrado, nunca
// consumido por nenhuma decisão de ação aqui: proposedResponse do
// Planner nunca é enviado, nunca substitui a resposta de teste abaixo
// (que continua sendo só uma prova de integração, não o Planner de
// verdade). Resposta nunca é gravada em conversation_messages, nunca
// altera state/mandate/opportunity/booking.
export async function runIntelligenceTestCall(conversationId: string): Promise<IntelligenceTestResult> {
  const supabase = await createClient();

  const actorResult = await resolveActorContext(supabase, conversationId, {
    kind: 'authenticated_user',
    triggerSource: 'dev_test_panel',
  });
  if (!actorResult.ok) {
    return { ok: false, error: actorResult.error };
  }
  const { actorContext, conversation } = actorResult;

  const gateResult = evaluatePreModelGate({ actorContext, conversation });
  if (!gateResult.ok) {
    return { ok: false, error: gateResult.error };
  }
  const { eligibleTools, allowedContextSources } = gateResult;

  const run = await startOrchestratorRun(supabase, {
    conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools,
  });

  let calledTools: string[] = [];
  // Fontes que ficaram 'unavailable' nesta execução (falha
  // operacional real, nunca ausência normal) — registradas aqui só
  // como código sanitizado, nunca a mensagem técnica original (essa
  // fica só dentro da tool, descartada; ver context-builder/sections.ts).
  let unavailableSources: string[] = [];
  let classification: IntentClassification | null = null;
  let plan: PlannerDecision | null = null;

  async function finishRun(status: 'completed' | 'failed', error: string | null) {
    if (!run) return;
    const fallbackUsed = unavailableSources.length > 0;
    const combinedError = fallbackUsed
      ? [error, `context_sources_unavailable:${unavailableSources.join(',')}`].filter(Boolean).join(' | ')
      : error;
    await finishOrchestratorRun(supabase, {
      runId: run.id,
      status,
      calledTools,
      error: combinedError,
      fallbackUsed,
      classification: classification
        ? {
            primaryIntent: classification.primaryIntent,
            secondaryIntents: classification.secondaryIntents,
            competencies: classification.relevantCompetencies,
            modelConfidence: classification.modelConfidence,
            effectiveConfidence: classification.effectiveConfidence,
            contextCompleteness: classification.contextCompleteness,
            classificationStatus: classification.classificationStatus,
          }
        : undefined,
      plan: plan
        ? {
            responsePlan: plan.responsePlan,
            commitmentNature: plan.commitmentNature,
            requiresProfessionalDecision: plan.requiresProfessionalDecision,
            professionalDecisionCategory: plan.professionalDecisionCategory,
            professionalDecisionSignal: plan.professionalDecisionSignal,
            missingInformationCount: plan.missingInformation.length,
            evidenceUsedCount: plan.evidenceUsed.length,
            requiresProfessionalReviewBeforeSend: plan.requiresProfessionalReviewBeforeSend,
          }
        : undefined,
    });
  }

  const toolCtx: ToolContext = {
    representedProfessionalId: actorContext.representedProfessionalId,
    actorContext,
    conversation,
    supabase,
  };

  const buildResult = await buildContextPackage(toolCtx, { allowedContextSources, eligibleTools });
  calledTools = buildResult.calledTools;
  unavailableSources = buildResult.unavailableSources.map((u) => u.source);
  const { contextPackage } = buildResult;

  // Percepção (Bloco 3) — só classifica, nunca decide nada a partir
  // disso aqui. Nunca lança: classifyIntent() sempre resolve, mesmo
  // em falha (cai em classificationStatus:'invalid').
  const classifyResult = await classifyIntent(toolCtx, contextPackage);
  classification = classifyResult.classification;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_INTENT_CLASSIFICATION,
    p_model: AI_MODEL,
    p_status: classification.classificationStatus === 'invalid' ? 'error' : 'success',
    p_conversation_id: conversationId,
    p_input_tokens: classifyResult.inputTokens,
    p_output_tokens: classifyResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  // Planejamento (Bloco 4, dry-run) — só propõe, nunca executa. Nunca
  // lança: planResponse() sempre resolve, mesmo em falha (cai no
  // fallback determinístico consult_professional).
  const planResult = await planResponse(toolCtx, contextPackage, classification);
  plan = planResult.decision;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_RESPONSE_PLANNING,
    p_model: AI_MODEL,
    p_status: 'success',
    p_conversation_id: conversationId,
    p_input_tokens: planResult.inputTokens,
    p_output_tokens: planResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  const representedName = resolveProfessionalDisplayName(contextPackage);
  const context = renderContextForPrompt(contextPackage);

  async function logUsage(status: 'success' | 'error', inputTokens: number | null, outputTokens: number | null) {
    await supabase.rpc('log_ai_usage_event', {
      p_feature: AI_FEATURE_INTELLIGENCE_TEST,
      p_model: AI_MODEL,
      p_status: status,
      p_conversation_id: conversationId,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_run_id: run?.id ?? null,
    });
  }

  let client;
  try {
    client = getOpenAIClient();
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    await logUsage('error', null, null);
    await finishRun('failed', 'openai_not_configured');
    return { ok: false, error: 'openai_not_configured', detail };
  }

  try {
    const response = await client.responses.create({
      model: AI_MODEL,
      instructions: buildTestInstructions(representedName),
      input: context,
    });

    const inputTokens = response.usage?.input_tokens ?? null;
    const outputTokens = response.usage?.output_tokens ?? null;
    await logUsage('success', inputTokens, outputTokens);
    await finishRun('completed', null);

    return { ok: true, responseText: response.output_text, inputTokens, outputTokens, classification, plan };
  } catch (err) {
    // Mensagem de erro do SDK da OpenAI nunca inclui a chave (vem do
    // corpo da resposta HTTP da API, que nunca ecoa a Authorization
    // header de volta) — segura pra devolver pro profissional testando
    // a própria chamada, e pra gravar em orchestrator_runs.error.
    //
    // Dívida de hardening registrada (não corrigida agora, fora do
    // escopo deste bloco): em tese `err.message` de uma falha da API
    // poderia ecoar um trecho do request numa mensagem de validação.
    // Sanitizar isso (allowlist de códigos curtos em vez de repassar a
    // mensagem crua do SDK) fica para quando um bloco futuro tocar
    // observability de novo.
    const detail = err instanceof Error ? err.message : undefined;
    await logUsage('error', null, null);
    await finishRun('failed', detail ?? 'openai_call_failed');
    return { ok: false, error: 'openai_call_failed', detail };
  }
}
