import type { SupabaseClient } from '@supabase/supabase-js';

import { runApprovalEngine } from '../intelligence/approval';
import { classifyIntent, AI_FEATURE_INTENT_CLASSIFICATION } from '../intelligence/classification';
import { AI_MODEL } from '../intelligence/config';
import { buildContextPackage } from '../intelligence/context-builder';
import { detectInboundProposal } from '../intelligence/inbound-proposal';
import { finishOrchestratorRun, startOrchestratorRun } from '../intelligence/observability';
import { AI_FEATURE_RESPONSE_PLANNING, planResponse } from '../intelligence/planner';
import { evaluatePreModelGate } from '../intelligence/policy-gate';
import { applyGateOutcome, evaluatePostModelGate, logPolicyGateDecision } from '../intelligence/policy-gate-post';
import '../intelligence/tools';
import type { ToolContext } from '../intelligence/types';
import { ensureOpportunityForConversation, resolveEffectiveCommercialRoot } from './commercial-root';
import { acquireConversationLease, releaseConversationLease } from './conversation-lease';
import { resolveRuntimeDisposition } from './disposition';
import { claimInboundEvent, finishInboundEvent } from './inbound-events';
import { persistInboundMessage, resolveOrCreateExternalParticipant } from './intake';
import { createOutboundIntent } from './outbound';
import { createRuntimePendingReply, fetchPolicyGateDecisionChecks, listPendingRuntimeReplies } from './pending-replies';
import { shouldCreatePendingReply, shouldSupersedeOnCreation } from './pending-replies-matching';
import { persistAiMessage } from './professional-message';
import { registerInboundProposal } from './proposal-classification';
import { resolveOutboundAction, resolveRecipientType, shouldRunApprovalEngine } from './recipient';
import { attemptResumptionsAfterApproval, type ResumptionOutcome } from './resumption';
import { buildStructuralFacts } from './structural-facts';
import { resolveSystemActorContext } from './system-actor';
import type { InboundEvent, RuntimeCycleOutcome } from './types';

// Doopla Intelligence Core v1 — Orchestrator/Runtime: pipeline
// principal. Encadeia os Blocos 1–6 numa única execução determinística
// por InboundEvent — idempotência → lease → identidade/mandato →
// intake → percepção → linking comercial → registro de proposta
// inbound → planejamento → aprovação → política pós-model → pendência
// de retomada (quando bloqueado) / outbound_intent (quando permitido)
// → retomada de pendências que a aprovação deste ciclo desbloqueou.
// Nunca chama o Approval Resolver duas vezes por mensagem do
// profissional, nunca reinterpreta approval fora do Bloco 5, nunca
// envia de verdade (ver comentário em types.ts).

export async function processInboundEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  event: InboundEvent
): Promise<RuntimeCycleOutcome> {
  const claim = await claimInboundEvent(supabase, {
    channel: event.channel,
    providerEventId: event.providerEventId,
    providerMessageId: event.providerMessageId,
  });
  if (!claim.claimed) {
    return { kind: 'duplicate_event', alreadyProcessed: claim.alreadyProcessed };
  }

  try {
    const lease = await acquireConversationLease(supabase, { conversationId: event.conversationId, workerId: event.workerId });
    if (!lease.granted) {
      // Posse, não falha de conteúdo — devolve o evento pro estado
      // 'failed' (reclamável depois do próprio lease de inbound_events
      // vencer, nunca preso pra sempre) em vez de 'processed'. Nunca
      // gasta um segundo worker tentando de novo imediatamente.
      await finishInboundEvent(supabase, { eventId: claim.eventId, status: 'failed', conversationMessageId: null, error: 'conversation_busy' });
      return { kind: 'conversation_busy' };
    }

    try {
      return await runCycle(supabase, event, claim.eventId);
    } finally {
      await releaseConversationLease(supabase, { conversationId: event.conversationId, leaseToken: lease.leaseToken! });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown_error';
    await finishInboundEvent(supabase, { eventId: claim.eventId, status: 'failed', conversationMessageId: null, error: detail });
    return { kind: 'failed', error: detail };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCycle(supabase: SupabaseClient<any>, event: InboundEvent, inboundEventId: string): Promise<RuntimeCycleOutcome> {
  const actorResult = await resolveSystemActorContext(supabase, event.conversationId);
  if (!actorResult.ok) {
    await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'failed', conversationMessageId: null, error: actorResult.error });
    return { kind: 'conversation_not_found' };
  }
  const { actorContext } = actorResult;

  const gateResult = evaluatePreModelGate({ actorContext, conversation: actorResult.conversation });
  if (!gateResult.ok) {
    await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'failed', conversationMessageId: null, error: gateResult.error });
    return { kind: 'failed', error: gateResult.error };
  }

  // Intake — resolve/cria o participante externo (quando aplicável) e
  // persiste a mensagem inbound. author_mismatch aqui é sempre um erro
  // de dado do chamador (canal→conversation errado), nunca do
  // pipeline — tratado como outcome próprio, não como falha genérica.
  let authorExternalParticipantId: string | null = null;
  if (event.authorType === 'external_participant') {
    if (!event.externalParticipantIdentifier) {
      await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'failed', conversationMessageId: null, error: 'missing_external_participant_identifier' });
      return { kind: 'failed', error: 'missing_external_participant_identifier' };
    }
    const participant = await resolveOrCreateExternalParticipant(supabase, {
      professionalId: actorContext.representedProfessionalId,
      channel: event.externalParticipantIdentifier.channel,
      identifier: event.externalParticipantIdentifier.identifier,
      name: event.externalParticipantIdentifier.name,
    });
    authorExternalParticipantId = participant.id;
  }

  let message: { id: string; createdAt: string };
  try {
    message = await persistInboundMessage(supabase, {
      conversationId: event.conversationId,
      authorType: event.authorType,
      authorProfileId: event.authorType === 'professional' ? event.authorProfileId : null,
      authorExternalParticipantId,
      channel: event.channel,
      contentType: event.contentType,
      body: event.body,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : '';
    if (detail.includes('author_mismatch')) {
      await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'failed', conversationMessageId: null, error: 'author_mismatch' });
      return { kind: 'author_mismatch' };
    }
    throw err;
  }

  // Re-busca a conversation: persistInboundMessage pode ter setado
  // external_participant_id no primeiro contato — o resto do pipeline
  // (Context Builder, Planner, recipientType do Gate) precisa da linha
  // atualizada, nunca da fatia pré-intake.
  const refreshed = await resolveSystemActorContext(supabase, event.conversationId);
  if (!refreshed.ok) {
    await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'failed', conversationMessageId: message.id, error: refreshed.error });
    return { kind: 'conversation_not_found' };
  }
  const conversation = refreshed.conversation;

  const run = await startOrchestratorRun(supabase, {
    conversationId: event.conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools: gateResult.eligibleTools,
  });

  const toolCtx: ToolContext = { representedProfessionalId: actorContext.representedProfessionalId, actorContext, conversation, supabase };

  const buildResult = await buildContextPackage(toolCtx, { allowedContextSources: gateResult.allowedContextSources, eligibleTools: gateResult.eligibleTools });
  const unavailableSources = buildResult.unavailableSources.map((u) => u.source);

  // Percepção (Bloco 3).
  const classifyResult = await classifyIntent(toolCtx, buildResult.contextPackage);
  const classification = classifyResult.classification;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_INTENT_CLASSIFICATION,
    p_model: AI_MODEL,
    p_status: classification.classificationStatus === 'invalid' ? 'error' : 'success',
    p_conversation_id: event.conversationId,
    p_input_tokens: classifyResult.inputTokens,
    p_output_tokens: classifyResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  // Linking conversation<->commercial root (migration 0051) — logo
  // após o Classifier, nunca depois do Planner (decisão do usuário:
  // opportunity pode nascer antes de qualquer compromisso).
  const linkResult = await ensureOpportunityForConversation(supabase, {
    conversationId: event.conversationId,
    primaryIntent: classification.primaryIntent,
    classificationStatus: classification.classificationStatus,
  });

  const { bookingId: effectiveBookingId, opportunityId: effectiveOpportunityId } = resolveEffectiveCommercialRoot(linkResult, {
    relatedBookingId: conversation.related_booking_id,
  });

  const hasCommercialRoot = effectiveBookingId !== null || effectiveOpportunityId !== null;

  // commercialRootId/structuralFacts resolvidos UMA vez aqui (antes só
  // buildStructuralFacts era chamado duas vezes nesta função — pro
  // Approval Engine e, separadamente, pro Gate — mesma leitura, sem
  // motivo pra duplicar). knownEventDate é usado tanto pelo registro
  // de proposta inbound (resolução temporal) quanto pelo Gate.
  let commercialRootId: string | null = null;
  let structuralFacts: Record<string, unknown> = {};
  let knownEventDate: string | null = null;
  if (hasCommercialRoot) {
    const { data: rootId } = await supabase.rpc('resolve_commercial_root_id', {
      p_booking_id: effectiveBookingId,
      p_opportunity_id: effectiveOpportunityId,
    });
    commercialRootId = (rootId as string) ?? null;
    const facts = await buildStructuralFacts(supabase, { bookingId: effectiveBookingId, opportunityId: effectiveOpportunityId });
    structuralFacts = facts.structuralFacts;
    knownEventDate = facts.knownEventDate;

    // Registro de proposta inbound (fechar o ciclo de decisão do
    // profissional) — gate = hasCommercialRoot sozinho (decisão do
    // usuário: nunca commitmentNature, sinal de outro propósito).
    // Roda em TODA mensagem inbound com root, de qualquer autor —
    // provenance estrita é estrutural dentro de detectInboundProposal
    // (input só {messageText, temporalCandidates}, nunca contexto).
    if (commercialRootId) {
      const detection = await detectInboundProposal(event.body, { referenceTimestamp: message.createdAt, timezone: null, knownEventDate });
      for (const proposal of detection.proposals) {
        await registerInboundProposal(supabase, {
          messageId: message.id,
          professionalId: actorContext.representedProfessionalId,
          bookingId: effectiveBookingId,
          opportunityId: effectiveOpportunityId,
          commercialRootId,
          proposedBy: event.authorType,
          proposal,
        });
      }
    }
  }

  // Planejamento (Bloco 4).
  const planResult = await planResponse(toolCtx, buildResult.contextPackage, classification);
  let decision = planResult.decision;
  await supabase.rpc('log_ai_usage_event', {
    p_feature: AI_FEATURE_RESPONSE_PLANNING,
    p_model: AI_MODEL,
    p_status: 'success',
    p_conversation_id: event.conversationId,
    p_input_tokens: planResult.inputTokens,
    p_output_tokens: planResult.outputTokens,
    p_run_id: run?.id ?? null,
  });

  let approvalOutcome: string | null = null;
  let resumptions: ResumptionOutcome[] = [];
  if (shouldRunApprovalEngine(event.authorType, hasCommercialRoot)) {
    const approvalResult = await runApprovalEngine(supabase, {
      professionalId: actorContext.representedProfessionalId,
      conversationId: event.conversationId,
      professionalStatementMessageId: message.id,
      bookingId: effectiveBookingId,
      opportunityId: effectiveOpportunityId,
      structuralFacts,
      workerId: event.workerId,
    });
    approvalOutcome = approvalResult.status;

    // Fecha o ciclo: aprovação nova pode desbloquear pendências de
    // OUTRAS conversations (a do cliente, ligada só por
    // commercial_root_id — nunca a mesma conversation da mensagem do
    // profissional). "Approval resolved ≠ send allowed": cada
    // pendência elegível é reprocessada 100% do zero (resumption.ts).
    if (approvalResult.status === 'committed' && approvalResult.outcome === 'resolved' && commercialRootId) {
      resumptions = await attemptResumptionsAfterApproval(supabase, {
        commercialRootId,
        approvalRecordIds: approvalResult.approvalRecordIds,
        workerId: event.workerId,
      });
    }
  }

  // Política pós-model (Bloco 6) — só quando há draft E um commercial
  // root real pra checar approval_records contra (sem root, nada foi
  // negociado ainda, nada a bloquear).
  let policyGateOutcome: 'allowed' | 'blocked' | 'not_applicable' = 'not_applicable';
  let policyGateBlockReason: string | null = null;
  let recipientType: 'external_participant' | 'professional' | null = null;
  let outboundIntentId: string | null = null;
  let aiMessageId: string | null = null;
  let pendingReplyId: string | null = null;

  if (decision.proposedResponse) {
    recipientType = resolveRecipientType(conversation.conversation_type, decision.responsePlan);

    // hasCommercialRoot=false é um caso REAL e esperado (intake/discovery
    // puro, antes de qualquer orçamento/disponibilidade classificado) —
    // evaluatePostModelGate (gate.ts) já sabe lidar com isso sem root
    // (roda só o extrator, bloqueia fail-closed se achar compromisso
    // ingroundável, permite livremente quando não há nada concreto).
    // Nunca gateado aqui por hasCommercialRoot: bloquear TODO outbound
    // sem root repetiria exatamente o erro já corrigido pro readiness
    // boundary (decisão final do usuário) — intake/discovery nunca pode
    // ser silenciado.
    const gate = await evaluatePostModelGate(supabase, {
      professionalId: actorContext.representedProfessionalId,
      bookingId: effectiveBookingId,
      opportunityId: effectiveOpportunityId,
      proposedResponse: decision.proposedResponse,
      recipientType,
      referenceTimestamp: message.createdAt,
      // Sem fonte confiável de timezone no schema hoje (decisão do
      // usuário, rodada anterior) — nunca um default implícito.
      timezone: null,
      knownEventDate,
    });
    policyGateOutcome = gate.outcome;
    policyGateBlockReason = gate.primaryBlockReason;
    decision = applyGateOutcome(decision, gate);

    // policy_gate_decisions.commercial_root_id é NOT NULL (migration
    // 0049) — sem commercial root não há o que logar ali (mesmo
    // raciocínio já usado pro caso proposedResponse vazio, que também
    // nunca chega a chamar logPolicyGateDecision). O outcome/motivo
    // continua refletido no RuntimeCycleOutcome retornado pelo ciclo,
    // só o log append-only fica de fora.
    let policyDecisionId: string | null = null;
    if (hasCommercialRoot && commercialRootId) {
      const logResult = await logPolicyGateDecision(supabase, {
        conversationId: event.conversationId,
        commercialRootId,
        messageId: message.id,
        runId: run?.id ?? null,
        result: gate,
      });
      policyDecisionId = logResult?.id ?? null;

      // Fecha o ciclo de decisão do profissional — quando o Gate
      // bloqueou por um motivo que uma approval de fato resolve
      // (no_matching_approval/stale_dependency/subject_key_unresolved),
      // registra a obrigação de retomada. policy_gate_decisions
      // continua append-only (decisão do usuário) — runtime_pending_replies
      // é o ÚNICO estado de workflow, cada linha uma fotografia
      // imutável de UM policy_gate_decision. Supersessão na criação só
      // por identidade REAL (categoria+subject resolvido) — nunca
      // subject_key_unresolved (pending-replies-matching.ts).
      if (gate.outcome === 'blocked' && policyDecisionId && shouldCreatePendingReply(gate.checks)) {
        const existingPending = await listPendingRuntimeReplies(supabase, commercialRootId);
        const supersedeIds: string[] = [];
        for (const p of existingPending) {
          const oldChecks = await fetchPolicyGateDecisionChecks(supabase, p.policyGateDecisionId);
          if (shouldSupersedeOnCreation(oldChecks, gate.checks)) supersedeIds.push(p.id);
        }
        const created = await createRuntimePendingReply(supabase, {
          conversationId: event.conversationId,
          commercialRootId,
          triggerMessageId: message.id,
          policyGateDecisionId: policyDecisionId,
          runId: run?.id ?? null,
          supersedeIds,
        });
        pendingReplyId = created.id;
      }
    }

    // Sempre cria o outbound_intent/persiste a mensagem quando o Gate
    // permite, independente de disposition (auto_send_eligible ou
    // professional_action_required) — o registro representa "o
    // Post-model Gate já validou este draft", nunca "pode enviar sem
    // revisão". Nenhum código deste bloco chama
    // claim_outbound_intent_for_send (ver types.ts) — quem decidir usar
    // disposition pra pular revisão é um worker de envio futuro, fora
    // de escopo aqui.
    const action = resolveOutboundAction(recipientType, gate.outcome, conversation.external_participant_id !== null);
    if (action === 'create_outbound_intent' && decision.proposedResponse) {
      const intent = await createOutboundIntent(supabase, {
        conversationId: event.conversationId,
        triggerMessageId: message.id,
        runId: run?.id ?? null,
        policyDecisionId,
        channel: event.channel,
        recipientExternalParticipantId: conversation.external_participant_id!,
        content: decision.proposedResponse,
      });
      outboundIntentId = intent.id;
    } else if (action === 'persist_ai_message' && decision.proposedResponse) {
      // persist_ai_message (migration 0052) — mesma infraestrutura de
      // conversations/conversation_messages, nunca outbound_intents
      // (não há canal/provider real entre a Doopla e o próprio
      // profissional dentro do app).
      const aiMessage = await persistAiMessage(supabase, {
        conversationId: event.conversationId,
        contentType: 'text',
        body: decision.proposedResponse,
      });
      aiMessageId = aiMessage.id;
    }
  }

  const disposition = resolveRuntimeDisposition(policyGateOutcome, decision.requiresProfessionalReviewBeforeSend);

  await finishOrchestratorRun(supabase, {
    runId: run?.id ?? '',
    status: 'completed',
    calledTools: buildResult.calledTools,
    error: unavailableSources.length > 0 ? `context_sources_unavailable:${unavailableSources.join(',')}` : null,
    fallbackUsed: unavailableSources.length > 0,
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

  await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'processed', conversationMessageId: message.id, error: null });

  return {
    kind: 'completed',
    conversationMessageId: message.id,
    runId: run?.id ?? null,
    opportunityId: effectiveOpportunityId,
    opportunityCreated: linkResult.created,
    approvalOutcome,
    policyGateOutcome,
    policyGateBlockReason,
    disposition,
    recipientType,
    outboundIntentId,
    aiMessageId,
    pendingReplyId,
    resumptions,
  };
}
