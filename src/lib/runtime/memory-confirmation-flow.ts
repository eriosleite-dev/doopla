import type { SupabaseClient } from '@supabase/supabase-js';

import { readAppSettingFlag } from './app-settings';
import { buildMemoryConfirmationQuestion, proposeMemory, reviewMemory } from '../intelligence/learning/memory-policy';
import {
  AI_FEATURE_MEMORY_CONFIRMATION_RECOGNITION,
  AI_FEATURE_PREFERENCE_RECOGNITION,
  MEMORY_CONFIRMATION_RECOGNIZER_MODEL,
  PREFERENCE_RECOGNIZER_MODEL,
} from '../intelligence/learning/config';
import { recognizeMemoryConfirmationReply, type MemoryConfirmationRecognizerModelCall } from '../intelligence/learning/memory-confirmation-recognizer';
import { recognizePreferenceDeclaration, type PreferenceRecognizerModelCall } from '../intelligence/learning/preference-recognizer';
import { logAiUsageEvent } from '../intelligence/observability';
import { fetchLastAiMessage } from './recent-conversation-messages';
import { getMostRecentProposedMemory, persistMemoryReview, persistProposedMemory } from './professional-memories';
import { persistAiMessage } from './professional-message';
import { sendProfessionalSelfReplyViaWhatsapp } from './professional-whatsapp-reply';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Task #72 — fluxo de confirmação de memória de preferências
// (proposed -> approved/rejected), e reconhecimento de novas
// declarações (nasce proposed). Mesmo desenho de delegated-contact-
// flow.ts: orquestração determinística, chamada de um ramo isolado em
// pipeline.ts ANTES do Classifier/Planner normal — handled=true
// encerra o ciclo aqui (evita a mesma classe de bug de "dupla
// mensagem" que o resto da sessão corrigiu em outro mecanismo: se o
// Planner normal também gerasse uma resposta pra esta MESMA mensagem,
// a profissional veria duas respostas pra um só turno).
//
// Gateado por app_settings.professional_memory_confirmation_enabled
// (migration 0125) — nasce 'false', mesmo padrão de
// delegated_contact_enabled.
//
// Lição estrutural do ADR 0010, aplicada aqui por desenho: a mera
// EXISTÊNCIA de uma professional_memories com status='proposed' NUNCA
// é tratada como "esta mensagem é uma resposta a ela" — só quando a
// ÚLTIMA mensagem de IA real da conversa é, literalmente, a pergunta
// determinística gerada pra ESSA proposta específica
// (buildMemoryConfirmationQuestion). Sem essa prova de continuidade, a
// mensagem cai no Ramo 2 (nova declaração) ou, se nem isso, no
// pipeline normal — nunca assume que uma proposta antiga/esquecida é
// relevante pra conversa atual.

export type MemoryConfirmationFlowParams = {
  professionalId: string;
  conversationId: string;
  triggerMessageId: string;
  messageText: string;
  channel: string;
};

export type MemoryConfirmationFlowOpts = {
  confirmationRecognizerModelCall?: MemoryConfirmationRecognizerModelCall;
  declarationRecognizerModelCall?: PreferenceRecognizerModelCall;
};

export type MemoryConfirmationFlowResult = { handled: boolean };

async function replyToProfessional(
  supabase: AnySupabaseClient,
  params: { conversationId: string; professionalId: string; channel: string; body: string }
): Promise<void> {
  const aiMessage = await persistAiMessage(supabase, { conversationId: params.conversationId, contentType: 'text', body: params.body });
  if (params.channel === 'whatsapp') {
    await sendProfessionalSelfReplyViaWhatsapp(supabase, {
      professionalId: params.professionalId,
      conversationId: params.conversationId,
      body: params.body,
      aiMessageId: aiMessage.id,
    });
  }
}

export async function runMemoryConfirmationFlow(
  supabase: AnySupabaseClient,
  params: MemoryConfirmationFlowParams,
  opts: MemoryConfirmationFlowOpts = {}
): Promise<MemoryConfirmationFlowResult> {
  if (!(await readAppSettingFlag(supabase, 'professional_memory_confirmation_enabled'))) {
    return { handled: false };
  }

  // Ramo 1 — resposta a uma confirmação já enviada.
  const pendingProposal = await getMostRecentProposedMemory(supabase, params.professionalId);
  if (pendingProposal) {
    const lastAiMessage = await fetchLastAiMessage(supabase, params.conversationId);
    const expectedQuestion = buildMemoryConfirmationQuestion(pendingProposal.value);
    if (lastAiMessage?.text === expectedQuestion) {
      const recognition = await recognizeMemoryConfirmationReply(params.messageText, { modelCall: opts.confirmationRecognizerModelCall });
      await logAiUsageEvent(supabase, {
        feature: AI_FEATURE_MEMORY_CONFIRMATION_RECOGNITION,
        model: MEMORY_CONFIRMATION_RECOGNIZER_MODEL,
        status: 'success',
        conversationId: params.conversationId,
        inputTokens: recognition.inputTokens,
        outputTokens: recognition.outputTokens,
        runId: null,
        professionalId: params.professionalId,
      });

      if (recognition.decision === 'confirms' || recognition.decision === 'rejects') {
        const decision = recognition.decision === 'confirms' ? 'approved' : 'rejected';
        const reviewResult = reviewMemory({ memory: pendingProposal, reviewerId: params.professionalId, decision });
        // reviewResult.ok=false aqui só pode significar uma corrida
        // perdida pra outra revisão concorrente (memory já saiu de
        // 'proposed' entre a leitura acima e agora) — nunca insiste,
        // cai no pipeline normal como qualquer outra mensagem.
        if (reviewResult.ok) {
          await persistMemoryReview(supabase, {
            id: reviewResult.memory.id,
            reviewerId: params.professionalId,
            decision,
            reviewedAt: reviewResult.memory.reviewedAt as string,
          });
          const ackBody =
            decision === 'approved' ? 'Combinado, vou levar isso em conta daqui pra frente.' : 'Sem problema, não vou guardar isso.';
          await replyToProfessional(supabase, { conversationId: params.conversationId, professionalId: params.professionalId, channel: params.channel, body: ackBody });
          return { handled: true };
        }
      }
      // decision === 'ambiguous' — nunca insiste numa segunda
      // tentativa sozinho; deixa a mensagem seguir pelo fluxo normal
      // (ela pode estar falando de outra coisa).
    }
  }

  // Ramo 2 — nova declaração de preferência (só chega aqui quando o
  // Ramo 1 não tratou esta mensagem como resposta a uma confirmação).
  const declaration = await recognizePreferenceDeclaration(params.messageText, { modelCall: opts.declarationRecognizerModelCall });
  await logAiUsageEvent(supabase, {
    feature: AI_FEATURE_PREFERENCE_RECOGNITION,
    model: PREFERENCE_RECOGNIZER_MODEL,
    status: 'success',
    conversationId: params.conversationId,
    inputTokens: declaration.inputTokens,
    outputTokens: declaration.outputTokens,
    runId: null,
    professionalId: params.professionalId,
  });

  if (!declaration.recognized || !declaration.kind || !declaration.value || declaration.confidence === null) {
    return { handled: false };
  }

  const proposeResult = proposeMemory({
    professionalId: params.professionalId,
    kind: declaration.kind,
    value: declaration.value,
    evidence: { sourceType: 'professional_message', sourceId: params.triggerMessageId },
    confidence: declaration.confidence,
  });
  if (!proposeResult.ok) return { handled: false };

  await persistProposedMemory(supabase, proposeResult.memory);
  await replyToProfessional(supabase, {
    conversationId: params.conversationId,
    professionalId: params.professionalId,
    channel: params.channel,
    body: buildMemoryConfirmationQuestion(proposeResult.memory.value),
  });
  return { handled: true };
}
