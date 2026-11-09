import type { SupabaseClient } from '@supabase/supabase-js';

import { readAppSettingFlag } from './app-settings';
import {
  buildMemoryConfirmationQuestion,
  buildMemorySupersessionQuestion,
  proposeMemory,
  resolveMemorySupersessionCandidate,
  reviewMemory,
  type ProfessionalMemory,
  type ScopedMemoryCandidate,
} from '../intelligence/learning/memory-policy';
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
import { getMostRecentProposedMemory, listApprovedProfessionalMemories, persistMemoryReview, persistMemoryRevocation, persistProposedMemory } from './professional-memories';
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

function toScopedCandidate(memory: ProfessionalMemory): ScopedMemoryCandidate {
  return { id: memory.id, kind: memory.kind, subjectKey: memory.subjectKey, value: memory.value };
}

// Task #76 (ADR 0012) — ÚNICO ponto que decide a pergunta de uma
// proposta e se ela, ao ser confirmada, substitui uma memória já
// aprovada. Usado tanto no Ramo 2 (decidir o que perguntar ao propor)
// quanto no Ramo 1 (recalcular, no momento da resposta, qual pergunta
// foi realmente enviada — nunca confia num ponteiro salvo na hora da
// proposta). Recalcular aqui em vez de guardar "supersede this id" na
// linha é deliberado: se o estado aprovado mudar entre propor e
// confirmar (outra revisão concorrente, por exemplo), a pergunta
// esperada muda junto — e a checagem de continuidade do Ramo 1
// (comparar contra a última mensagem de IA real) nunca mais casa,
// então a mensagem cai pro fluxo normal em vez de revogar a memória
// errada. Nunca confia em "existe uma pendência" sozinho, mesma lição
// do ADR 0010.
async function resolveQuestionForDeclaration(
  supabase: AnySupabaseClient,
  memory: Pick<ProfessionalMemory, 'professionalId' | 'kind' | 'subjectKey' | 'value'>
): Promise<{ question: string; supersedes: ScopedMemoryCandidate | null }> {
  const approved = await listApprovedProfessionalMemories(supabase, memory.professionalId);
  const resolution = resolveMemorySupersessionCandidate({ kind: memory.kind, subjectKey: memory.subjectKey }, approved.map(toScopedCandidate));

  if (resolution.kind === 'supersede_candidate') {
    return { question: buildMemorySupersessionQuestion(memory.value, resolution.existing.value), supersedes: resolution.existing };
  }
  // 'coexist' e 'ambiguous' tratados igual nesta v1 (ADR 0012, seção
  // 4.4) — o ciclo de esclarecimento pra ambiguidade genuína é
  // entrega separada, recomendada mas não implementada ainda. Nunca
  // substitui nada quando não há exatamente uma candidata clara.
  return { question: buildMemoryConfirmationQuestion(memory.value), supersedes: null };
}

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
    // Recalculado AGORA, nunca lido de um ponteiro salvo na proposta —
    // ver comentário de resolveQuestionForDeclaration. Também resolve
    // SE a confirmação, caso vier, revoga uma memória aprovada.
    const { question: expectedQuestion, supersedes } = await resolveQuestionForDeclaration(supabase, pendingProposal);
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

          // Task #76 — só revoga a antiga quando a NOVA foi de fato
          // aprovada (nunca em 'rejects': rejeitar a proposta nova
          // nunca deve tocar a memória antiga, que continua válida).
          // A guarda atômica real é a da RPC (revoke_professional_memory,
          // WHERE status='approved') — nunca reconstrói um
          // ProfessionalMemory falso aqui só pra reusar revokeMemory
          // (puro) de novo; se a linha já saiu de 'approved' por outro
          // caminho entre o cálculo de `supersedes` e agora, a RPC
          // lança, e isto é engolido de propósito: a memória nova já
          // foi aprovada de qualquer forma, nunca quebra o ciclo por
          // uma corrida concorrente numa limpeza secundária.
          if (decision === 'approved' && supersedes) {
            try {
              await persistMemoryRevocation(supabase, { id: supersedes.id, revokedBy: params.professionalId, revokedAt: reviewResult.memory.reviewedAt as string });
            } catch (err) {
              console.error('[memory-confirmation] falha ao revogar memória substituída (corrida concorrente ou já revogada)', err);
            }
          }

          const ackBody =
            decision === 'approved'
              ? supersedes
                ? 'Combinado, atualizei — a preferência anterior foi substituída por essa.'
                : 'Combinado, vou levar isso em conta daqui pra frente.'
              : 'Sem problema, não vou guardar isso.';
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
    subjectKey: declaration.subjectKey,
  });
  if (!proposeResult.ok) return { handled: false };

  // Supersessão de HIGIENE da PROPOSTA pendente (task #72) — nunca
  // deixa uma pergunta de confirmação antiga orfanada em 'proposed'
  // pra sempre quando uma declaração nova chega antes de ela ser
  // respondida: a proposta anterior é encerrada como 'rejected'
  // (auditável, nunca apagada), mesmo princípio já usado em
  // runtime_pending_replies (supersedeIds/shouldSupersedeOnCreation,
  // pipeline.ts). DIFERENTE da supersessão de CONTRADIÇÃO entre
  // memórias já APROVADAS (task #76, resolveQuestionForDeclaration
  // abaixo) — aqui é só limpeza de uma pergunta nunca respondida,
  // nunca uma decisão sobre qual preferência está certa.
  if (pendingProposal) {
    const supersedeResult = reviewMemory({ memory: pendingProposal, reviewerId: params.professionalId, decision: 'rejected' });
    if (supersedeResult.ok) {
      await persistMemoryReview(supabase, {
        id: supersedeResult.memory.id,
        reviewerId: params.professionalId,
        decision: 'rejected',
        reviewedAt: supersedeResult.memory.reviewedAt as string,
      });
    }
  }

  await persistProposedMemory(supabase, proposeResult.memory);
  // Task #76 — a pergunta já nasce vinculada à contradição real
  // (mesma function usada no Ramo 1 pra recalcular, nunca duas
  // formulações divergentes pro mesmo caso).
  const { question } = await resolveQuestionForDeclaration(supabase, proposeResult.memory);
  await replyToProfessional(supabase, {
    conversationId: params.conversationId,
    professionalId: params.professionalId,
    channel: params.channel,
    body: question,
  });
  return { handled: true };
}
