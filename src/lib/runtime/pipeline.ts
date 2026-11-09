import type { SupabaseClient } from '@supabase/supabase-js';

import { runApprovalEngine } from '../intelligence/approval';
import { classifyIntent, AI_FEATURE_INTENT_CLASSIFICATION } from '../intelligence/classification';
import { AI_MODEL } from '../intelligence/config';
import { buildContextPackage } from '../intelligence/context-builder';
import { EMPTY_CONVERSATION_STATE_SNAPSHOT, advanceConversationStateSnapshot, writeConversationStateSnapshot } from '../intelligence/conversation-state';
import type { ConversationStateTurnInput } from '../intelligence/conversation-state';
import { detectInboundProposal, AI_FEATURE_INBOUND_PROPOSAL_DETECTION, INBOUND_PROPOSAL_MODEL } from '../intelligence/inbound-proposal';
import { finishOrchestratorRun, logAiUsageEvent, startOrchestratorRun } from '../intelligence/observability';
import { AI_FEATURE_RESPONSE_PLANNING, filterCommitmentAuthorizingEvidence, planResponse } from '../intelligence/planner';
import { evaluatePreModelGate } from '../intelligence/policy-gate';
import { applyGateOutcome, evaluatePostModelGate, logPolicyGateDecision } from '../intelligence/policy-gate-post';
import '../intelligence/tools';
import type { ActorContext, MinimalConversation, ToolContext } from '../intelligence/types';
import { ensureOpportunityForConversation, resolveEffectiveCommercialRoot } from './commercial-root';
import { acquireConversationLease, releaseConversationLease } from './conversation-lease';
import { recordConversationFeedback } from './conversation-feedback';
import { getLastWhatsappInboundAt, shouldSendColdOutreachTemplate } from './cold-outreach';
import { resolveRuntimeDisposition } from './disposition';
import { claimInboundEvent, finishInboundEvent } from './inbound-events';
import { persistInboundMessage, resolveOrCreateExternalParticipant } from './intake';
import { createOutboundIntent } from './outbound';
import { fetchLastAiMessage } from './recent-conversation-messages';
import { createRuntimePendingReply, fetchPolicyGateDecisionChecks, listPendingRuntimeReplies } from './pending-replies';
import { shouldCreatePendingReply, shouldSupersedeOnCreation } from './pending-replies-matching';
import { persistAiMessage } from './professional-message';
import { resolveProfessionalDisplayName } from './professional-identity';
import { sendProfessionalSelfReplyViaWhatsapp } from './professional-whatsapp-reply';
import { setProfessionalSelfReplyPaused } from './professional-self-reply-pause';
import {
  recognizeProfessionalSelfPauseRequest,
  AI_FEATURE_PROFESSIONAL_SELF_PAUSE_RECOGNITION,
  PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL,
} from '../intelligence/professional-self-pause';
import {
  recognizeConversationFeedback,
  AI_FEATURE_CONVERSATION_FEEDBACK_RECOGNITION,
  CONVERSATION_FEEDBACK_RECOGNIZER_MODEL,
} from '../intelligence/conversation-feedback';
import { registerInboundProposal } from './proposal-classification';
import { resolveOutboundAction, resolveRecipientType, shouldRunApprovalEngine } from './recipient';
import { runDelegatedContactRecipientReplyFlow, runDelegatedContactRequestFlow } from './delegated-contact-flow';
import { runMemoryConfirmationFlow } from './memory-confirmation-flow';
import { attemptResumptionsAfterApproval, type ResumptionOutcome } from './resumption';
import { evaluateDecisionPrepared, evaluateMeaningfulClientAction, recordOrchestratorRunContextEvidence, recordProductEvent } from '../beta-instrumentation';
import { buildStructuralFacts } from './structural-facts';
import { resolveSystemActorContext } from './system-actor';
import type { InboundEvent, RuntimeCycleOutcome } from './types';
import { renderColdOutreachTemplateContent } from '../channels/whatsapp/cold-outreach-template';
import { createServiceRoleClient } from '../supabase/service-role';

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

// Pura, sem I/O — testável determinística sem mock de Supabase. Único
// critério: pelo menos um registro committado agora É accept_or_decline_work
// com approved_value.accepted === true, exatamente e nunca mais que
// isso (nunca a mera presença da categoria — correção semântica
// 16/09/2026 — nem outra categoria qualquer, preço incluso).
export function hasCanonicalWorkAcceptance(
  records: readonly { decision_category: string; approved_value: Record<string, unknown> | null }[]
): boolean {
  return records.some((r) => r.decision_category === 'accept_or_decline_work' && r.approved_value?.accepted === true);
}

// Direct Booking sem Booker (16/09/2026) — único gatilho automático
// permitido, por decisão de produto explícita: nenhum botão manual,
// nenhuma outra evidência (preço discutido, conversa existir) conta.
// Só dispara quando ESTE commit do Approval Engine (approvalRecordIds
// recém-escritos, nesta mesma chamada de runCycle) inclui um
// accept_or_decline_work com accepted=true (hasCanonicalWorkAcceptance
// acima) — nunca reinterpreta um registro antigo/de outra chamada.
// Usa service-role de propósito: convert_opportunity_to_booking() só
// aceita is_system_caller() (por decisão de produto: nenhum caminho de
// UI/authenticated comum pode chamá-la), e a autorização real já foi
// validada por runApprovalEngine/commit_approval_resolution acima —
// este client nunca herda o que quer que tenha disparado o ciclo
// (webhook do WhatsApp já é service-role; resposta do profissional
// pelo painel usa a sessão dele, que nunca teria privilégio suficiente
// pra esta RPC sozinha). convert_opportunity_to_booking() revalida
// tudo de novo internamente (get_active_approvals fresco) — este
// helper nunca é a fonte de autorização, só o gatilho.
async function maybeConvertToDirectBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { opportunityId: string | null; bookingId: string | null; approvalRecordIds: string[] }
): Promise<void> {
  if (!params.opportunityId || params.bookingId || params.approvalRecordIds.length === 0) return;

  const { data: committedRecords, error } = await supabase
    .from('approval_records')
    .select('decision_category, approved_value')
    .in('id', params.approvalRecordIds);
  if (error) return;
  if (!hasCanonicalWorkAcceptance(committedRecords ?? [])) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRoleClient: SupabaseClient<any> = createServiceRoleClient();
  await serviceRoleClient.rpc('convert_opportunity_to_booking', { p_opportunity_id: params.opportunityId });
  // Erro aqui nunca derruba o ciclo do Runtime (a mensagem/aprovação já
  // foram commitadas de verdade) — só significa que a conversão em
  // Booking fica pendente pra uma próxima tentativa. A function é
  // idempotente (unique index + advisory lock), então repetir nunca
  // duplica nada quando/se uma retentativa futura existir.
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
      repliedToOutboundIntentId: event.authorType === 'professional' ? (event.repliedToOutboundIntentId ?? null) : null,
      providerMessageId: event.providerMessageId,
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

  // Beta Instrumentation — product.demand_received: primeiro sinal real
  // de interesse de um cliente chegando pra este profissional (marco do
  // funil de TTV). Critério determinístico: esta é a PRIMEIRA mensagem
  // de author_type='external_participant' desta conversation — nunca um
  // heurística de tempo, uma contagem real pós-inserção. Nunca lançável
  // (telemetria) — falha aqui nunca derruba o ciclo principal.
  if (event.authorType === 'external_participant' && conversation.conversation_type === 'external_inquiry') {
    const { count } = await supabase
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', event.conversationId)
      .eq('author_type', 'external_participant');
    if (count === 1) {
      await recordProductEvent(supabase, {
        professionalId: actorContext.representedProfessionalId,
        category: 'product',
        eventType: 'product.demand_received',
        occurredAt: new Date(message.createdAt),
        idempotencyKey: `product.demand_received:${event.conversationId}`,
        subjectType: 'conversation',
        subjectId: event.conversationId,
        conversationId: event.conversationId,
        sourceMessageId: message.id,
        actorType: 'external_participant',
        source: 'runtime',
      });
    }
  }

  // ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
  // reconhece pedido de pausa real EM TODA mensagem nova da
  // profissional em professional_self, ANTES de qualquer outra coisa
  // neste ciclo — nunca espera a fila/drain (requisito explícito:
  // reconhecimento imediato, sem atraso entre "pare de me escrever" e
  // o estado realmente pausar). Best-effort: falha aqui NUNCA derruba
  // o ciclo principal. signal=null (falha total do recognizer) NUNCA
  // muda o estado de pausa existente — ver recognizer.ts pro porquê
  // (nunca interpreta uma falha técnica como "ela não pediu pausa").
  if (event.authorType === 'professional' && conversation.conversation_type === 'professional_self') {
    try {
      const pauseRecognition = await recognizeProfessionalSelfPauseRequest(event.body);
      await logAiUsageEvent(supabase, {
        feature: AI_FEATURE_PROFESSIONAL_SELF_PAUSE_RECOGNITION,
        model: PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL,
        status: 'success',
        conversationId: event.conversationId,
        inputTokens: pauseRecognition.inputTokens,
        outputTokens: pauseRecognition.outputTokens,
        runId: null,
        professionalId: actorContext.representedProfessionalId,
      });
      if (pauseRecognition.signal === 'pause_requested') {
        await setProfessionalSelfReplyPaused(supabase, { conversationId: event.conversationId, paused: true });
      } else if (pauseRecognition.signal === 'no_signal') {
        // Retomada automática: qualquer mensagem nova que o recognizer
        // confirma NÃO ser um pedido de pausa já reabre, sem precisar
        // de um comando explícito de "voltar"/"pode continuar".
        await setProfessionalSelfReplyPaused(supabase, { conversationId: event.conversationId, paused: false });
      }
    } catch (err) {
      console.error('[professional-self-pause] falha ao reconhecer/aplicar pedido de pausa', err);
    }
  }

  // ADR 0011 (20/10/2026) — Fase A do sistema de evolução contínua:
  // reconhece feedback semântico ("Erro"/"Perfeito!") em paralelo ao
  // ciclo normal, nunca dependente do Planner nem da fila de retry de
  // professional_self (professional_self_pending_messages) — grava
  // direto, fora desse caminho. Best-effort: falha aqui NUNCA derruba
  // o ciclo principal nem impede a resposta normal de ser gerada ou
  // enviada.
  if (event.authorType === 'professional' && conversation.conversation_type === 'professional_self') {
    try {
      const lastAiMessage = await fetchLastAiMessage(supabase, event.conversationId);
      const feedbackRecognition = await recognizeConversationFeedback(event.body, lastAiMessage?.text ?? null);
      await logAiUsageEvent(supabase, {
        feature: AI_FEATURE_CONVERSATION_FEEDBACK_RECOGNITION,
        model: CONVERSATION_FEEDBACK_RECOGNIZER_MODEL,
        status: 'success',
        conversationId: event.conversationId,
        inputTokens: feedbackRecognition.inputTokens,
        outputTokens: feedbackRecognition.outputTokens,
        runId: null,
        professionalId: actorContext.representedProfessionalId,
      });
      if (feedbackRecognition.signal === 'negative' || feedbackRecognition.signal === 'positive') {
        const recorded = await recordConversationFeedback(supabase, {
          conversationId: event.conversationId,
          triggerMessageId: message.id,
          flaggedMessageId: lastAiMessage?.id ?? null,
          signal: feedbackRecognition.signal,
          comment: event.body,
          modelUsed: CONVERSATION_FEEDBACK_RECOGNIZER_MODEL,
        });
        // Confirmação só pra feedback NEGATIVO (requisito explícito:
        // elogio nunca precisa virar outra conversa) — nunca antes de
        // confirmado que o registro foi persistido (recorded !== null).
        // Reaproveita o MESMO choke point de sempre
        // (sendProfessionalSelfReplyViaWhatsapp): contenção, pausa,
        // atualidade, idempotência e detecção de loop já se aplicam
        // aqui, de graça — nunca um caminho de envio novo e paralelo.
        if (recorded && feedbackRecognition.signal === 'negative') {
          const confirmationBody = 'Registrei esse erro para análise.';
          const confirmation = await persistAiMessage(supabase, { conversationId: event.conversationId, contentType: 'text', body: confirmationBody });
          if (event.channel === 'whatsapp') {
            await sendProfessionalSelfReplyViaWhatsapp(supabase, {
              professionalId: actorContext.representedProfessionalId,
              conversationId: event.conversationId,
              body: confirmationBody,
              aiMessageId: confirmation.id,
            });
          }
        }
      }
    } catch (err) {
      console.error('[conversation-feedback] falha ao reconhecer/registrar feedback', err);
    }
  }

  // Task #72 — fluxo de confirmação de memória de preferências
  // (proposed->approved/rejected, ou reconhecimento de uma nova
  // declaração). Mesma posição/mesmo raciocínio do ramo de delegação
  // logo abaixo: decidido ANTES de qualquer chamada a classifyIntent/
  // planResponse, porque os dois ramos internos
  // (memory-confirmation-flow.ts) podem mandar uma resposta
  // determinística própria — se o Classifier/Planner normal também
  // gerasse uma resposta pra esta MESMA mensagem, a profissional veria
  // duas respostas pra um só turno (mesma classe de bug já corrigida
  // em outro mecanismo nesta sessão). handled=false (inclui o caso da
  // flag desligada) -> cai 100% no pipeline normal, inalterado.
  if (event.authorType === 'professional' && conversation.conversation_type === 'professional_self') {
    const memoryResult = await runMemoryConfirmationFlow(supabase, {
      professionalId: actorContext.representedProfessionalId,
      conversationId: event.conversationId,
      triggerMessageId: message.id,
      messageText: event.body,
      channel: event.channel,
    });
    if (memoryResult.handled) return await finishMemoryConfirmationBranch(supabase, event, inboundEventId, actorContext, conversation, message.id);
  }

  // Etapa 2.1 "Doopla chama o cliente" (14/10/2026) — dois ramos
  // isolados, decididos ANTES de qualquer chamada a classifyIntent/
  // planResponse (mesma posição/mesmo raciocínio do ramo de cold
  // outreach logo abaixo): nenhum dos dois reconhece um pedido de
  // delegação -> handled=false -> cai 100% no pipeline normal,
  // inalterado (garantia estrutural, nunca modifica Classifier/
  // Planner/Policy Gates/Approval Engine/bookings/outbound existentes).
  if (event.authorType === 'professional' && conversation.conversation_type === 'professional_self') {
    const result = await runDelegatedContactRequestFlow(supabase, {
      professionalId: actorContext.representedProfessionalId,
      conversationId: event.conversationId,
      triggerMessageId: message.id,
      messageText: event.body,
      channel: event.channel,
    });
    if (result.handled) return await finishDelegatedContactBranch(supabase, event, inboundEventId, actorContext, conversation, message.id);
  }

  if (event.authorType === 'external_participant' && conversation.external_participant_id) {
    const result = await runDelegatedContactRecipientReplyFlow(supabase, {
      conversationId: event.conversationId,
      messageId: message.id,
      messageText: event.body,
    });
    if (result.handled) return await finishDelegatedContactBranch(supabase, event, inboundEventId, actorContext, conversation, message.id);
  }

  // Passo 6A+6B Fase 2 — ramo determinístico do primeiro outreach frio
  // ("profissional manda contato -> Doopla inicia" sem CSW aberta).
  // Decidido AQUI, antes de qualquer chamada a classifyIntent/
  // planResponse/runApprovalEngine/evaluatePostModelGate (Blocos 3-6) —
  // nenhuma delas tem o que fazer com um template fixo pré-aprovado
  // pela Meta: o conteúdo não é gerado nem negociável, não há nada a
  // classificar/planejar/aprovar. Único boundary/trilha de auditoria
  // preservados: mesmo claimInboundEvent/lease/intake já rodados acima,
  // mesmo orchestrator_run abaixo — nunca um create_outbound_intent
  // paralelo fora do Runtime (decisão do usuário).
  if (conversation.external_participant_id) {
    const lastWhatsappInboundAt = await getLastWhatsappInboundAt(supabase, { externalParticipantId: conversation.external_participant_id });
    const coldOutreach = shouldSendColdOutreachTemplate({
      authorType: event.authorType,
      channel: event.channel,
      conversationType: conversation.conversation_type,
      externalParticipantId: conversation.external_participant_id,
      lastWhatsappInboundAt,
      now: new Date(),
    });

    if (coldOutreach) {
      return await runColdOutreachTemplateBranch(supabase, event, inboundEventId, actorContext, conversation, message.id);
    }
  }

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
  await logAiUsageEvent(supabase, {
    feature: AI_FEATURE_INTENT_CLASSIFICATION,
    model: AI_MODEL,
    status: classification.classificationStatus === 'invalid' ? 'error' : 'success',
    conversationId: event.conversationId,
    inputTokens: classifyResult.inputTokens,
    outputTokens: classifyResult.outputTokens,
    runId: run?.id ?? null,
    professionalId: actorContext.representedProfessionalId,
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
      // Head of AI (15/10/2026) — achado de auditoria: esta chamada real
      // à OpenAI nunca registrava uso/custo, apesar de rodar em TODA
      // mensagem inbound com commercial root (potencialmente mais vezes
      // por ciclo que Classifier/Planner juntos). AI_FEATURE_INBOUND_PROPOSAL_DETECTION
      // já existia em config.ts, só nunca foi conectada a logAiUsageEvent.
      await logAiUsageEvent(supabase, {
        feature: AI_FEATURE_INBOUND_PROPOSAL_DETECTION,
        model: INBOUND_PROPOSAL_MODEL,
        status: detection.unavailable ? 'error' : 'success',
        conversationId: event.conversationId,
        inputTokens: detection.inputTokens,
        outputTokens: detection.outputTokens,
        runId: run?.id ?? null,
        professionalId: actorContext.representedProfessionalId,
      });
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
  await logAiUsageEvent(supabase, {
    feature: AI_FEATURE_RESPONSE_PLANNING,
    model: AI_MODEL,
    status: 'success',
    conversationId: event.conversationId,
    inputTokens: planResult.inputTokens,
    outputTokens: planResult.outputTokens,
    runId: run?.id ?? null,
    professionalId: actorContext.representedProfessionalId,
  });

  // Beta Instrumentation — value.decision_prepared: avaliado sobre a
  // decisão do PLANNER, antes do Gate/Approval Engine — "a Doopla
  // preparou" é sobre o que ela montou, não sobre o que sobrevive depois.
  if (evaluateDecisionPrepared(decision)) {
    await recordProductEvent(supabase, {
      professionalId: actorContext.representedProfessionalId,
      category: 'value',
      eventType: 'value.decision_prepared',
      occurredAt: new Date(message.createdAt),
      idempotencyKey: `value.decision_prepared:${run?.id ?? message.id}`,
      subjectType: 'conversation',
      subjectId: event.conversationId,
      commercialRootId,
      conversationId: event.conversationId,
      runId: run?.id ?? null,
      sourceMessageId: message.id,
      actorType: 'ai',
      source: 'runtime',
    });
  }

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
      runId: run?.id ?? null,
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

      // Direct Booking sem Booker — ver comentário de maybeConvertToDirectBooking.
      await maybeConvertToDirectBooking(supabase, {
        opportunityId: effectiveOpportunityId,
        bookingId: effectiveBookingId,
        approvalRecordIds: approvalResult.approvalRecordIds,
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
      conversationId: event.conversationId,
      runId: run?.id ?? null,
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
        requiresProfessionalReview: decision.requiresProfessionalReviewBeforeSend,
      });
      outboundIntentId = intent.id;

      // Beta Instrumentation — value.meaningful_client_action: prova só
      // EXECUÇÃO de uma ação client-facing validada, nunca "avanço" (sem
      // evidência de resposta/resultado do cliente).
      if (
        evaluateMeaningfulClientAction({
          responsePlan: decision.responsePlan,
          gateOutcome: policyGateOutcome,
          outboundIntentCreated: true,
          recipientType,
        })
      ) {
        await recordProductEvent(supabase, {
          professionalId: actorContext.representedProfessionalId,
          category: 'value',
          eventType: 'value.meaningful_client_action',
          occurredAt: new Date(),
          idempotencyKey: `value.meaningful_client_action:${outboundIntentId}`,
          subjectType: 'conversation',
          subjectId: event.conversationId,
          commercialRootId,
          conversationId: event.conversationId,
          runId: run?.id ?? null,
          sourceMessageId: message.id,
          actorType: 'ai',
          source: 'runtime',
        });
      }
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

      // "Falar com minha Doopla" (produto, setembro/2026, concluído
      // 13/10/2026) — painel continua sendo o registro de verdade
      // (linha acima, nunca substituída); isto é só o caminho de saída
      // adicional quando a conversa é pelo WhatsApp. Ver
      // professional-whatsapp-reply.ts pro porquê de nunca usar
      // outbound_intents aqui.
      if (event.channel === 'whatsapp') {
        await sendProfessionalSelfReplyViaWhatsapp(supabase, {
          professionalId: conversation.represented_professional_id,
          conversationId: event.conversationId,
          body: decision.proposedResponse,
          aiMessageId: aiMessage.id,
          triggerMessageId: message.id,
        });
      }
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
      // evidence_used_count preserva a semântica de sempre (camada B —
      // commitment-authorizing evidence, ver planner/invariants.ts):
      // decision.evidenceUsed é a lista completa (camada A, auditável,
      // inclui Professional Intelligence Context), então o filtro aqui é
      // obrigatório pra esta coluna não passar a contar preferência/
      // histórico como se fossem evidência de compromisso. Persistência
      // detalhada da camada A: ver recordOrchestratorRunContextEvidence
      // logo abaixo (Beta Instrumentation).
      evidenceUsedCount: filterCommitmentAuthorizingEvidence(decision.evidenceUsed).length,
      requiresProfessionalReviewBeforeSend: decision.requiresProfessionalReviewBeforeSend,
    },
  });

  // Beta Instrumentation — camada A completa (context/reasoning
  // evidence) persistida em detalhe, uma linha por EvidenceUsed
  // grounded. Nunca decide nada sozinha (ver comentário acima) — só
  // auditoria de "o que a Doopla usou". Sem run real, nada a persistir.
  if (run?.id) {
    await recordOrchestratorRunContextEvidence(supabase, {
      runId: run.id,
      professionalId: actorContext.representedProfessionalId,
      evidence: decision.evidenceUsed,
    });
  }

  await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'processed', conversationMessageId: message.id, error: null });

  // Conversation State Ledger — avança o snapshot com o que o
  // Classifier/Planner JÁ produziram nesta rodada (decision final,
  // pós-gate), nunca um recálculo retroativo. Prior snapshot vem do
  // MESMO ContextPackage que o Planner usou (buildResult.contextPackage),
  // nunca uma segunda leitura separada — garante que "o que avança" é
  // exatamente "o que o Planner viu". Falha de escrita nunca derruba o
  // turno (writeConversationStateSnapshot nunca lança, ver store.ts).
  const conversationStateBefore =
    buildResult.contextPackage.conversationState.status === 'loaded' ? buildResult.contextPackage.conversationState.snapshot : EMPTY_CONVERSATION_STATE_SNAPSHOT;
  const conversationStateTurnInput: ConversationStateTurnInput = {
    triggerMessageId: message.id,
    triggerAuthorType: event.authorType,
    triggerMessageSnippet: event.body.length > 500 ? `${event.body.slice(0, 500)}…` : event.body,
    primaryIntent: classification.primaryIntent,
    secondaryIntents: classification.secondaryIntents,
    proposedDecisionCategory: decision.professionalDecisionCategory,
    commitmentNature: decision.commitmentNature,
    responsePlan: decision.responsePlan,
  };
  await writeConversationStateSnapshot(supabase, event.conversationId, advanceConversationStateSnapshot(conversationStateBefore, conversationStateTurnInput));

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

// Etapa 2.1 "Doopla chama o cliente" — mesmo raciocínio de
// runColdOutreachTemplateBranch logo abaixo: só a trilha de auditoria
// (orchestrator_run + inbound_events), já que toda a decisão real
// (reconhecer o pedido, avançar a máquina de estados, compor a
// resposta determinística) já aconteceu dentro de
// runDelegatedContactRequestFlow/runDelegatedContactRecipientReplyFlow
// antes deste ponto ser alcançado. Nunca chamado fora de runCycle.
async function finishDelegatedContactBranch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  event: InboundEvent,
  inboundEventId: string,
  actorContext: ActorContext,
  conversation: MinimalConversation,
  triggerMessageId: string
): Promise<RuntimeCycleOutcome> {
  const run = await startOrchestratorRun(supabase, {
    conversationId: event.conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools: [],
  });

  await finishOrchestratorRun(supabase, { runId: run?.id ?? '', status: 'completed', calledTools: [], error: null, fallbackUsed: false });
  await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'processed', conversationMessageId: triggerMessageId, error: null });

  return { kind: 'delegated_contact_handled', conversationMessageId: triggerMessageId, runId: run?.id ?? null };
}

// Task #72 — espelha finishDelegatedContactBranch acima (mesmo
// raciocínio: start/finish de um orchestrator_run "vazio" só pra
// manter a mesma trilha de auditoria de todo ciclo, sem chamar
// classifyIntent/planResponse) — outcome próprio (memory_confirmation_handled)
// em vez de reaproveitar delegated_contact_handled, que descreveria
// errado o que realmente aconteceu neste ciclo.
async function finishMemoryConfirmationBranch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  event: InboundEvent,
  inboundEventId: string,
  actorContext: ActorContext,
  conversation: MinimalConversation,
  triggerMessageId: string
): Promise<RuntimeCycleOutcome> {
  const run = await startOrchestratorRun(supabase, {
    conversationId: event.conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools: [],
  });

  await finishOrchestratorRun(supabase, { runId: run?.id ?? '', status: 'completed', calledTools: [], error: null, fallbackUsed: false });
  await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'processed', conversationMessageId: triggerMessageId, error: null });

  return { kind: 'memory_confirmation_handled', conversationMessageId: triggerMessageId, runId: run?.id ?? null };
}

// Passo 6A+6B Fase 2 — extraído de runCycle pra deixar o early-return
// (linha acima do call site) auditável de relance: NENHUMA chamada a
// classifyIntent/planResponse/runApprovalEngine/evaluatePostModelGate
// existe neste caminho, só leitura determinística (nome de exibição da
// profissional) + escrita já existente (create_outbound_intent,
// send_as='template') + a MESMA dupla start/finishOrchestratorRun de
// qualquer outro ciclo, pra manter uma única trilha de auditoria mesmo
// sem Planner. Nunca chamado fora de runCycle (não é exportado).
async function runColdOutreachTemplateBranch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  event: InboundEvent,
  inboundEventId: string,
  actorContext: ActorContext,
  conversation: MinimalConversation,
  triggerMessageId: string
): Promise<RuntimeCycleOutcome> {
  const run = await startOrchestratorRun(supabase, {
    conversationId: event.conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools: [],
  });

  const professionalDisplayName = await resolveProfessionalDisplayName(supabase, actorContext.representedProfessionalId);
  // profiles.full_name é NOT NULL (migration 0001) — este fallback é
  // só uma guarda defensiva pro caso teórico de representedProfessionalId
  // não resolver nenhuma linha (nunca deveria ocorrer aqui: já é a
  // dona da conversation), nunca a expectativa normal.
  const renderedContent = renderColdOutreachTemplateContent(professionalDisplayName ?? 'a profissional');

  const intent = await createOutboundIntent(supabase, {
    conversationId: event.conversationId,
    triggerMessageId,
    runId: run?.id ?? null,
    policyDecisionId: null,
    channel: event.channel,
    // conversation.external_participant_id já foi checado not-null pelo
    // chamador (shouldSendColdOutreachTemplate exige isso) — non-null
    // assertion segura, mesmo padrão já usado em pipeline.ts pro ramo
    // normal (action === 'create_outbound_intent').
    recipientExternalParticipantId: conversation.external_participant_id!,
    content: renderedContent,
    sendAs: 'template',
    // Template fixo pré-aprovado pela Meta (sem conteúdo gerado/
    // negociável) — nunca passa por requiresProfessionalReviewBeforeSend
    // (não existe Planner neste ramo), sempre seguro por construção.
    requiresProfessionalReview: false,
  });

  await finishOrchestratorRun(supabase, {
    runId: run?.id ?? '',
    status: 'completed',
    calledTools: [],
    error: null,
    fallbackUsed: false,
  });

  await finishInboundEvent(supabase, { eventId: inboundEventId, status: 'processed', conversationMessageId: triggerMessageId, error: null });

  return {
    kind: 'cold_outreach_template',
    conversationMessageId: triggerMessageId,
    runId: run?.id ?? null,
    outboundIntentId: intent.id,
  };
}
