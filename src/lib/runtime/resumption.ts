import type { SupabaseClient } from '@supabase/supabase-js';

import { classifyIntent, AI_FEATURE_INTENT_CLASSIFICATION } from '../intelligence/classification';
import { AI_MODEL } from '../intelligence/config';
import { buildContextPackage } from '../intelligence/context-builder';
import { finishOrchestratorRun, startOrchestratorRun } from '../intelligence/observability';
import { AI_FEATURE_RESPONSE_PLANNING, planResponse } from '../intelligence/planner';
import { evaluatePreModelGate } from '../intelligence/policy-gate';
import { applyGateOutcome, evaluatePostModelGate, logPolicyGateDecision } from '../intelligence/policy-gate-post';
import '../intelligence/tools';
import type { ToolContext } from '../intelligence/types';
import { resolveCommercialRootForResumption } from './commercial-root';
import { acquireConversationLease, releaseConversationLease } from './conversation-lease';
import { truncateContextAtMessage } from './context-window';
import {
  beginRuntimePendingReplyAttempt,
  fetchPolicyGateDecisionChecks,
  listDueRuntimePendingReplies,
  listPendingRuntimeReplies,
  recordRuntimePendingReplyBusy,
  resolveRuntimePendingReplyAllowed,
  resolveRuntimePendingReplyStillBlocked,
  type RuntimePendingReply,
} from './pending-replies';
import { shouldAttemptResume, type BlockedIdentity } from './pending-replies-matching';
import { persistAiMessage } from './professional-message';
import { resolveOutboundAction, resolveRecipientType } from './recipient';
import { computeRuntimeRetryBackoffSeconds, RUNTIME_PENDING_REPLY_MAX_ATTEMPTS, RUNTIME_PENDING_REPLY_SAFETY_NET_SECONDS } from './retry-backoff';
import { buildStructuralFacts } from './structural-facts';
import { resolveSystemActorContext } from './system-actor';

// Doopla Intelligence Core v1 — Runtime: retomada de turnos bloqueados
// depois que o Approval Resolver aprova algo novo ("fechar o ciclo de
// decisão do profissional", autorizado após 3 rodadas de auditoria).
//
// "Approval resolved ≠ send allowed" — cada tentativa reprocessa
// Planner + Post-model Gate 100% FRESCOS (nunca reaproveita
// draft/decisão antigos), num orchestrator_run PRÓPRIO, e só chama a
// RPC de resolução (que cria o outbound_intent) quando a NOVA
// avaliação do Gate de fato permite. A pendência que não bate com
// nenhuma identidade recém-aprovada, ou cuja raiz comercial não é mais
// reconstruível, nunca é tocada — fica exatamente como estava.
//
// Isolamento de falha: a conversation de uma pendência quase sempre é
// DIFERENTE da conversation do evento que disparou a aprovação (client
// conversation vs. professional_self conversation, ligadas só por
// commercial_root_id) — nunca compartilha a lease já adquirida pelo
// ciclo principal. Cada tentativa adquire a SUA PRÓPRIA
// conversation lease (mesmo mecanismo de conversation-lease.ts) e
// nunca deixa uma falha aqui derrubar o ciclo principal que a
// disparou — cada pendência é tentada isoladamente, erro vira outcome,
// nunca throw propagado.

export type ResumptionOutcome =
  // Tentativa nem chegou a começar — begin_runtime_pending_reply_attempt
  // negou porque outra tentativa reservou o horário primeiro, ou a
  // linha foi resolvida/superseded por outro caminho entre a leitura e
  // a tentativa (concorrência normal, nunca um erro).
  | { pendingReplyId: string; kind: 'skipped_not_due_yet' }
  // attempt_count esgotou RUNTIME_PENDING_REPLY_MAX_ATTEMPTS — a linha
  // já virou 'needs_attention' (terminal de observabilidade, nunca
  // reprocessada automaticamente de novo).
  | { pendingReplyId: string; kind: 'needs_attention'; attemptCount: number }
  // conversation ocupada — a tentativa FOI contabilizada
  // (begin_runtime_pending_reply_attempt já rodou) e um retry com
  // backoff foi agendado (record_runtime_pending_reply_busy). A linha
  // continua 'pending', explicitamente retryable — nunca perdida.
  | { pendingReplyId: string; kind: 'conversation_busy_retry_scheduled'; nextAttemptAt: string | null; attemptCount: number }
  | { pendingReplyId: string; kind: 'skipped_root_mismatch' }
  | { pendingReplyId: string; kind: 'skipped_trigger_not_in_window' }
  | { pendingReplyId: string; kind: 'left_pending_no_draft' }
  | { pendingReplyId: string; kind: 'still_blocked'; newPendingReplyId: string | null }
  | { pendingReplyId: string; kind: 'resolved'; outboundIntentId: string | null; aiMessageId: string | null }
  | { pendingReplyId: string; kind: 'failed'; error: string };

export async function attemptResumptionsAfterApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { commercialRootId: string; approvalRecordIds: string[]; workerId: string }
): Promise<ResumptionOutcome[]> {
  if (params.approvalRecordIds.length === 0) return [];

  const { data: approvedRows, error: approvedError } = await supabase
    .from('approval_records')
    .select('decision_category, subject_key')
    .in('id', params.approvalRecordIds);
  if (approvedError) throw new Error(`leitura de approval_records falhou: ${approvedError.message}`);

  const newlyApprovedIdentities: BlockedIdentity[] = ((approvedRows ?? []) as Array<{ decision_category: string; subject_key: string }>).map((r) => ({
    decisionCategory: r.decision_category,
    subjectKey: r.subject_key,
  }));
  if (newlyApprovedIdentities.length === 0) return [];

  const pendingReplies = await listPendingRuntimeReplies(supabase, params.commercialRootId);
  const outcomes: ResumptionOutcome[] = [];

  for (const pending of pendingReplies) {
    try {
      const pendingChecks = await fetchPolicyGateDecisionChecks(supabase, pending.policyGateDecisionId);
      if (!shouldAttemptResume(pendingChecks, newlyApprovedIdentities)) continue;
      outcomes.push(await resumeOnePendingReply(supabase, pending, params.workerId));
    } catch (err) {
      outcomes.push({ pendingReplyId: pending.id, kind: 'failed', error: err instanceof Error ? err.message : 'unknown_error' });
    }
  }
  return outcomes;
}

// Ponto de entrada único pra QUALQUER tentativa de retomada, disparada
// por aprovação nova (attemptResumptionsAfterApproval) OU pelo
// reconciler (reconcileDueRuntimePendingReplies) — mesmo ciclo, mesmas
// garantias, em ambos os casos. Retomada durável (migration 0054):
// begin_runtime_pending_reply_attempt roda ANTES de qualquer lease —
// serve de heartbeat de segurança (cobre um crash a meio da tentativa,
// não só conversation_busy) E de claim de concorrência (duas
// tentativas na MESMA linha, uma delas sempre perde). Só depois disso
// a conversation lease é tentada; se esbarrar em busy,
// record_runtime_pending_reply_busy agenda um retry com backoff mais
// apertado — a linha NUNCA sai de 'pending' por causa disso, nunca
// fica "perdida".
export async function resumeOnePendingReply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  pending: RuntimePendingReply,
  workerId: string
): Promise<ResumptionOutcome> {
  const begin = await beginRuntimePendingReplyAttempt(supabase, {
    pendingReplyId: pending.id,
    safetyNetSeconds: RUNTIME_PENDING_REPLY_SAFETY_NET_SECONDS,
    maxAttempts: RUNTIME_PENDING_REPLY_MAX_ATTEMPTS,
  });
  if (!begin.granted) {
    if (begin.exhausted) return { pendingReplyId: pending.id, kind: 'needs_attention', attemptCount: begin.attemptCount };
    return { pendingReplyId: pending.id, kind: 'skipped_not_due_yet' };
  }

  const lease = await acquireConversationLease(supabase, { conversationId: pending.conversationId, workerId });
  if (!lease.granted) {
    const backoffSeconds = computeRuntimeRetryBackoffSeconds(begin.attemptCount);
    const busy = await recordRuntimePendingReplyBusy(supabase, {
      pendingReplyId: pending.id,
      backoffSeconds,
      maxAttempts: RUNTIME_PENDING_REPLY_MAX_ATTEMPTS,
    });
    if (busy.exhausted) return { pendingReplyId: pending.id, kind: 'needs_attention', attemptCount: begin.attemptCount };
    return { pendingReplyId: pending.id, kind: 'conversation_busy_retry_scheduled', nextAttemptAt: busy.nextAttemptAt, attemptCount: begin.attemptCount };
  }
  try {
    return await runResumptionCycle(supabase, pending);
  } finally {
    await releaseConversationLease(supabase, { conversationId: pending.conversationId, leaseToken: lease.leaseToken! });
  }
}

// Reconciler/worker — reaproveita QUALQUER pendência que já passou por
// pelo menos uma tentativa (agendada via begin_attempt/record_busy) e
// está due, SEM depender de uma nova aprovação futura. Nenhuma
// infraestrutura de agendamento real (cron/fila) é criada nesta rodada
// — este é o ponto de entrada que um worker/trigger futuro chamaria
// periodicamente; fora de escopo decidir aqui QUANDO/COMO ele roda de
// verdade.
export async function reconcileDueRuntimePendingReplies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { workerId: string; limit?: number }
): Promise<ResumptionOutcome[]> {
  const due = await listDueRuntimePendingReplies(supabase, { limit: params.limit ?? 50 });
  const outcomes: ResumptionOutcome[] = [];
  for (const pending of due) {
    try {
      outcomes.push(await resumeOnePendingReply(supabase, pending, params.workerId));
    } catch (err) {
      outcomes.push({ pendingReplyId: pending.id, kind: 'failed', error: err instanceof Error ? err.message : 'unknown_error' });
    }
  }
  return outcomes;
}

async function runResumptionCycle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  pending: RuntimePendingReply
): Promise<ResumptionOutcome> {
  const actorResult = await resolveSystemActorContext(supabase, pending.conversationId);
  if (!actorResult.ok) return { pendingReplyId: pending.id, kind: 'skipped_root_mismatch' };
  const { actorContext, conversation } = actorResult;

  const roots = await resolveCommercialRootForResumption(supabase, {
    commercialRootId: pending.commercialRootId,
    conversation: { relatedBookingId: conversation.related_booking_id, relatedOpportunityId: conversation.related_opportunity_id },
  });
  if (!roots) return { pendingReplyId: pending.id, kind: 'skipped_root_mismatch' };

  const gateResult = evaluatePreModelGate({ actorContext, conversation });
  if (!gateResult.ok) return { pendingReplyId: pending.id, kind: 'skipped_root_mismatch' };

  const { data: triggerRow, error: triggerError } = await supabase
    .from('conversation_messages')
    .select('created_at, channel')
    .eq('id', pending.triggerMessageId)
    .maybeSingle<{ created_at: string; channel: string }>();
  if (triggerError || !triggerRow) return { pendingReplyId: pending.id, kind: 'skipped_trigger_not_in_window' };

  const run = await startOrchestratorRun(supabase, {
    conversationId: pending.conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools: gateResult.eligibleTools,
  });

  const toolCtx: ToolContext = { representedProfessionalId: actorContext.representedProfessionalId, actorContext, conversation, supabase };

  const buildResult = await buildContextPackage(toolCtx, { allowedContextSources: gateResult.allowedContextSources, eligibleTools: gateResult.eligibleTools });
  const truncated = truncateContextAtMessage(buildResult.contextPackage, pending.triggerMessageId);
  if (!truncated.ok) {
    await finishOrchestratorRun(supabase, { runId: run?.id ?? '', status: 'failed', calledTools: buildResult.calledTools, error: 'trigger_message_not_in_window', fallbackUsed: false });
    return { pendingReplyId: pending.id, kind: 'skipped_trigger_not_in_window' };
  }
  const contextPackage = truncated.contextPackage;

  const classifyResult = await classifyIntent(toolCtx, contextPackage);
  const classification = classifyResult.classification;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_INTENT_CLASSIFICATION,
    p_model: AI_MODEL,
    p_status: classification.classificationStatus === 'invalid' ? 'error' : 'success',
    p_conversation_id: pending.conversationId,
    p_input_tokens: classifyResult.inputTokens,
    p_output_tokens: classifyResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  const planResult = await planResponse(toolCtx, contextPackage, classification);
  let decision = planResult.decision;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_RESPONSE_PLANNING,
    p_model: AI_MODEL,
    p_status: 'success',
    p_conversation_id: pending.conversationId,
    p_input_tokens: planResult.inputTokens,
    p_output_tokens: planResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  const finish = (status: 'completed' | 'failed', error: string | null) =>
    finishOrchestratorRun(supabase, {
      runId: run?.id ?? '',
      status,
      calledTools: buildResult.calledTools,
      error,
      fallbackUsed: buildResult.unavailableSources.length > 0,
      classification: {
        primaryIntent: classification.primaryIntent,
        secondaryIntents: classification.secondaryIntents,
        competencies: classification.relevantCompetencies,
        modelConfidence: classification.modelConfidence,
        effectiveConfidence: classification.effectiveConfidence,
        contextCompleteness: classification.contextCompleteness,
        classificationStatus: classification.classificationStatus,
      },
      plan: {
        responsePlan: decision.responsePlan,
        commitmentNature: decision.commitmentNature,
        requiresProfessionalDecision: decision.requiresProfessionalDecision,
        professionalDecisionCategory: decision.professionalDecisionCategory,
        professionalDecisionSignal: decision.professionalDecisionSignal,
        missingInformationCount: decision.missingInformation.length,
        evidenceUsedCount: decision.evidenceUsed.length,
        requiresProfessionalReviewBeforeSend: decision.requiresProfessionalReviewBeforeSend,
      },
    });

  if (!decision.proposedResponse) {
    // Nada a decidir sobre enviar nesta reavaliação — o Gate nem chega
    // a rodar, nenhuma fotografia nova, nenhuma RPC de resolução
    // chamada. A pendência continua exatamente como estava (decisão do
    // usuário: só uma avaliação FRESCA que de fato produz um Gate
    // outcome pode consumi-la).
    await finish('completed', null);
    return { pendingReplyId: pending.id, kind: 'left_pending_no_draft' };
  }

  const recipientType = resolveRecipientType(conversation.conversation_type, decision.responsePlan);
  const { knownEventDate } = await buildStructuralFacts(supabase, { bookingId: roots.bookingId, opportunityId: roots.opportunityId });

  const gate = await evaluatePostModelGate(supabase, {
    professionalId: actorContext.representedProfessionalId,
    bookingId: roots.bookingId,
    opportunityId: roots.opportunityId,
    proposedResponse: decision.proposedResponse,
    recipientType,
    referenceTimestamp: triggerRow.created_at,
    timezone: null,
    knownEventDate,
  });
  decision = applyGateOutcome(decision, gate);

  const logResult = await logPolicyGateDecision(supabase, {
    conversationId: pending.conversationId,
    commercialRootId: pending.commercialRootId,
    messageId: pending.triggerMessageId,
    runId: run?.id ?? null,
    result: gate,
  });
  const newPolicyDecisionId = logResult?.id ?? null;
  if (!newPolicyDecisionId) {
    // Log falhou — fail-closed: sem uma fotografia nova real, nenhuma
    // RPC de resolução é chamada (nunca resolve contra um
    // policy_gate_decision_id inexistente). Uma tentativa futura pode
    // reavaliar de novo.
    await finish('failed', 'policy_gate_decision_log_failed');
    return { pendingReplyId: pending.id, kind: 'left_pending_no_draft' };
  }

  if (gate.outcome === 'blocked') {
    const result = await resolveRuntimePendingReplyStillBlocked(supabase, {
      pendingReplyId: pending.id,
      newPolicyGateDecisionId: newPolicyDecisionId,
      runId: run?.id ?? null,
    });
    await finish('completed', null);
    return { pendingReplyId: pending.id, kind: 'still_blocked', newPendingReplyId: result.newPendingReplyId };
  }

  // allowed
  const action = resolveOutboundAction(recipientType, gate.outcome, conversation.external_participant_id !== null);
  let outboundIntentId: string | null = null;
  let aiMessageId: string | null = null;

  if (action === 'create_outbound_intent' && decision.proposedResponse) {
    const result = await resolveRuntimePendingReplyAllowed(supabase, {
      pendingReplyId: pending.id,
      newPolicyGateDecisionId: newPolicyDecisionId,
      runId: run?.id ?? null,
      outbound: { channel: triggerRow.channel, recipientExternalParticipantId: conversation.external_participant_id!, content: decision.proposedResponse },
    });
    outboundIntentId = result.outboundIntentId;
  } else if (action === 'persist_ai_message' && decision.proposedResponse) {
    // Caso raro (recipientType virou 'professional' nesta reavaliação)
    // — claim primeiro (sem outbound_intent), depois persist_ai_message
    // por fora, best-effort — mesmo tradeoff documentado na migration
    // 0053 (não atômico com o claim; duplicação de mensagem interna ao
    // profissional é o risco aceito, nunca duplicação client-facing).
    await resolveRuntimePendingReplyAllowed(supabase, { pendingReplyId: pending.id, newPolicyGateDecisionId: newPolicyDecisionId, runId: run?.id ?? null, outbound: null });
    const aiMessage = await persistAiMessage(supabase, { conversationId: pending.conversationId, contentType: 'text', body: decision.proposedResponse });
    aiMessageId = aiMessage.id;
  } else {
    // allowed sem action correspondente (guarda defensiva, mesmo
    // raciocínio de resolveOutboundAction no ciclo normal) — só faz o
    // claim, nunca inventa destinatário.
    await resolveRuntimePendingReplyAllowed(supabase, { pendingReplyId: pending.id, newPolicyGateDecisionId: newPolicyDecisionId, runId: run?.id ?? null, outbound: null });
  }

  await finish('completed', null);
  return { pendingReplyId: pending.id, kind: 'resolved', outboundIntentId, aiMessageId };
}
