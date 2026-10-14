import type { SupabaseClient } from '@supabase/supabase-js';

import { renderColdOutreachTemplateContent } from '../channels/whatsapp/cold-outreach-template';
import { normalizeWhatsappPhone } from '../channels/whatsapp/phone';
import { readAppSettingFlag } from './app-settings';
import {
  checkRecipientConsent,
  recognizeDelegatedContactRequest,
  DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS,
  type ActiveDelegatedContactSummary,
  type DelegatedContactRecognizerModelCall,
  type RecipientConsentCheckModelCall,
} from '../intelligence/delegated-contact';
import { resolveOrCreateExternalParticipant } from './intake';
import { createOutboundIntent } from './outbound';
import {
  cancelPendingDelegatedContact,
  claimPendingDelegatedContactDecision,
  claimPendingDelegatedContactForLiteralContentSend,
  claimPendingDelegatedContactForTemplateExecution,
  claimPendingDelegatedContactLiteralContentDecision,
  createDelegatedContactConversation,
  createPendingDelegatedContact,
  getMostRecentPendingDelegatedContact,
  getPendingDelegatedContactAwaitingReplyByConversation,
  markPendingDelegatedContactExecuted,
  markPendingDelegatedContactExpiredNoReply,
  markPendingDelegatedContactFailed,
  markPendingDelegatedContactLiteralContentFailed,
  markPendingDelegatedContactLiteralContentSent,
  preparePendingDelegatedContactApproval,
  preparePendingDelegatedContactLiteralContentReview,
  setPendingDelegatedContactRecipientReply,
  updatePendingDelegatedContactPendingInfo,
  type PendingDelegatedContact,
} from './pending-delegated-contacts';
import { persistAiMessage } from './professional-message';
import { resolveProfessionalDisplayName } from './professional-identity';
import { sendProfessionalSelfReplyViaWhatsapp } from './professional-whatsapp-reply';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// orquestração determinística. NUNCA chama o Planner — todo texto
// enviado à profissional aqui é composto em código, a partir do estado
// REAL já persistido, nunca de uma geração livre. Isso é deliberado:
// requisito explícito da fundadora (14/10/2026) de que "enviou?"/"já
// mandou?" recuperem o estado real sem voltar ao Planner e sem pedir
// outra autorização, e que a Doopla nunca declare a tarefa concluída
// antes da execução correspondente.
//
// Duas entradas, cada uma chamada de um ramo isolado em pipeline.ts:
// runDelegatedContactRequestFlow (mensagens da PROFISSIONAL em
// professional_self) e runDelegatedContactRecipientReplyFlow (1ª
// resposta real do DESTINATÁRIO numa conversation criada por esta
// funcionalidade). As duas devolvem handled=false quando não há nada
// a fazer aqui — o chamador cai no pipeline normal, inalterado.

async function replyToProfessional(supabase: AnySupabaseClient, params: { conversationId: string; professionalId: string; channel: string; body: string }): Promise<void> {
  await persistAiMessage(supabase, { conversationId: params.conversationId, contentType: 'text', body: params.body });
  if (params.channel === 'whatsapp') {
    await sendProfessionalSelfReplyViaWhatsapp(supabase, { professionalId: params.professionalId, body: params.body });
  }
}

function buildActiveSummary(recent: PendingDelegatedContact | null): ActiveDelegatedContactSummary | null {
  if (!recent) return null;
  // Descrição sintética da pergunta pendente (nunca o texto literal
  // persistido em conversation_messages — não precisamos buscá-lo pra
  // dar contexto suficiente ao recognizer, e isso evita uma leitura
  // extra só pra montar este resumo). Só um dos dois gates pode estar
  // aberto ao mesmo tempo nesta linha (literal_content_gate só chega
  // a 'awaiting_recipient_review' bem depois de status já ter saído de
  // 'pending_approval').
  let pendingConfirmationText: string | null = null;
  if (recent.status === 'pending_approval') {
    pendingConfirmationText = `confirmar envio da mensagem para ${recent.recipientName ?? 'o destinatário'}`;
  } else if (recent.literalContentGate === 'awaiting_recipient_review') {
    pendingConfirmationText = `prosseguir mesmo com resposta ambígua de ${recent.recipientName ?? 'o destinatário'}`;
  }
  return {
    status: recent.status,
    literalContentGate: recent.literalContentGate,
    recipientName: recent.recipientName,
    recipientNumberKnown: recent.recipientNumber !== null,
    pendingConfirmationText,
  };
}

// ============================================================
// Entrada A — mensagens da profissional em professional_self.
// ============================================================

export type DelegatedContactRequestFlowParams = {
  professionalId: string;
  conversationId: string;
  triggerMessageId: string;
  messageText: string;
  channel: string;
};

export type DelegatedContactRequestFlowOpts = {
  recognizerModelCall?: DelegatedContactRecognizerModelCall;
  recognizerMaxRetries?: number;
};

export type DelegatedContactRequestFlowResult = { handled: boolean };

export async function runDelegatedContactRequestFlow(
  supabase: AnySupabaseClient,
  params: DelegatedContactRequestFlowParams,
  opts: DelegatedContactRequestFlowOpts = {}
): Promise<DelegatedContactRequestFlowResult> {
  // Proteção de ativação (app_settings.delegated_contact_enabled,
  // migration 0109) — nasce 'false': nenhum pedido NOVO é reconhecido
  // até o teste controlado ligar isto explicitamente (UPDATE, nunca
  // nova migration/deploy). Checado ANTES de qualquer leitura de
  // estado ou chamada ao recognizer — desligado é custo zero, nunca só
  // "esconde a ação", de fato não faz nada. Nunca gateia a resposta do
  // DESTINATÁRIO (runDelegatedContactRecipientReplyFlow) — uma
  // delegação já aprovada antes de um desligamento futuro continua até
  // o fim, nunca é abandonada no meio.
  if (!(await readAppSettingFlag(supabase, 'delegated_contact_enabled'))) {
    return { handled: false };
  }

  const recent = await getMostRecentPendingDelegatedContact(supabase, { professionalId: params.professionalId });
  const recognized = await recognizeDelegatedContactRequest(params.messageText, buildActiveSummary(recent), {
    modelCall: opts.recognizerModelCall,
    maxRetries: opts.recognizerMaxRetries,
  });

  const reply = (body: string) => replyToProfessional(supabase, { conversationId: params.conversationId, professionalId: params.professionalId, channel: params.channel, body });

  switch (recognized.signal) {
    case 'no_delegation_signal':
      return { handled: false };

    case 'new_request':
      return handleNewRequest(supabase, params, recent, recognized, reply);

    case 'provides_missing_info':
      if (!recent || recent.status !== 'pending_number') return { handled: false };
      return handleProvidesMissingInfo(supabase, params, recent, recognized, reply);

    case 'confirms_pending':
    case 'rejects_pending': {
      const approved = recognized.signal === 'confirms_pending';
      if (recent?.status === 'pending_approval') return handleFirstGateDecision(supabase, params, recent, approved, reply);
      if (recent?.literalContentGate === 'awaiting_recipient_review') return handleSecondGateDecision(supabase, recent, params.triggerMessageId, approved, reply);
      return { handled: false };
    }

    case 'cancels_pending':
      if (!recent || (recent.status !== 'pending_number' && recent.status !== 'pending_approval')) {
        if (recent) {
          await reply('Esse pedido já está em andamento e não pode mais ser cancelado por aqui — mas ainda não enviei a mensagem original, se for isso que você quer evitar me avise o que prefere.');
          return { handled: true };
        }
        return { handled: false };
      }
      await cancelPendingDelegatedContact(supabase, { id: recent.id, decisionMessageId: params.triggerMessageId });
      await reply('Tudo bem, cancelei esse pedido.');
      return { handled: true };

    case 'status_inquiry':
      if (!recent) return { handled: false };
      return handleStatusInquiry(supabase, recent, reply);
  }
}

async function handleNewRequest(
  supabase: AnySupabaseClient,
  params: DelegatedContactRequestFlowParams,
  recent: PendingDelegatedContact | null,
  recognized: { recipientName: string | null; recipientNumber: string | null; purposeSummary: string | null; draftMessageContent: string | null },
  reply: (body: string) => Promise<void>
): Promise<DelegatedContactRequestFlowResult> {
  // Índice único (migration 0109) já impede duas linhas pending_number/
  // pending_approval pro mesmo profissional — esta checagem é só pra
  // dar uma resposta clara em vez de deixar o INSERT falhar.
  if (recent && (recent.status === 'pending_number' || recent.status === 'pending_approval')) {
    await reply('Já tem um pedido de contato em andamento. Pode confirmar esse primeiro ou me dizer "cancela" antes de pedir um novo.');
    return { handled: true };
  }

  const normalizedNumber = recognized.recipientNumber ? normalizeWhatsappPhone(recognized.recipientNumber) : null;
  const row = await createPendingDelegatedContact(supabase, {
    requestingProfessionalId: params.professionalId,
    conversationId: params.conversationId,
    triggerMessageId: params.triggerMessageId,
    purposeSummary: recognized.purposeSummary ?? '(não especificado)',
    recipientName: recognized.recipientName,
    recipientNumber: normalizedNumber,
  });

  return advanceOrAskForMissing(supabase, params, row, { draftMessageContent: recognized.draftMessageContent }, reply);
}

async function handleProvidesMissingInfo(
  supabase: AnySupabaseClient,
  params: DelegatedContactRequestFlowParams,
  recent: PendingDelegatedContact,
  recognized: { recipientName: string | null; recipientNumber: string | null; purposeSummary: string | null; draftMessageContent: string | null },
  reply: (body: string) => Promise<void>
): Promise<DelegatedContactRequestFlowResult> {
  const normalizedNumber = recognized.recipientNumber ? normalizeWhatsappPhone(recognized.recipientNumber) : null;
  const updated = await updatePendingDelegatedContactPendingInfo(supabase, {
    id: recent.id,
    recipientName: recognized.recipientName,
    recipientNumber: normalizedNumber,
    draftMessageContent: recognized.draftMessageContent,
    purposeSummary: recognized.purposeSummary,
  });

  return advanceOrAskForMissing(supabase, params, updated, { draftMessageContent: updated.draftMessageContent }, reply);
}

// Comum aos dois caminhos acima: uma vez que recipientNumber E
// draftMessageContent existem (vindos deste turno ou de um turno
// anterior já persistido), arma a pergunta de confirmação; senão,
// pergunta exatamente o que falta — nunca repete o que já foi dado.
async function advanceOrAskForMissing(
  supabase: AnySupabaseClient,
  params: DelegatedContactRequestFlowParams,
  row: PendingDelegatedContact,
  extra: { draftMessageContent: string | null },
  reply: (body: string) => Promise<void>
): Promise<DelegatedContactRequestFlowResult> {
  const draftMessageContent = extra.draftMessageContent ?? row.draftMessageContent;
  if (!row.recipientNumber) {
    await reply(`Entendi${row.recipientName ? ` que é pra falar com ${row.recipientName}` : ''}. Falta só o número de WhatsApp dela/dele para eu continuar.`);
    return { handled: true };
  }
  if (!draftMessageContent) {
    await reply('Certo, já tenho o contato. Qual é o texto exato que você quer que eu mande?');
    return { handled: true };
  }

  const questionBody = `Vou iniciar o contato com ${row.recipientName ?? row.recipientNumber} e, depois que ela/ele responder, mandar esta mensagem: "${draftMessageContent}". Confirma?`;
  const question = await persistAiMessage(supabase, { conversationId: params.conversationId, contentType: 'text', body: questionBody });
  if (params.channel === 'whatsapp') {
    await sendProfessionalSelfReplyViaWhatsapp(supabase, { professionalId: params.professionalId, body: questionBody });
  }
  await preparePendingDelegatedContactApproval(supabase, {
    id: row.id,
    recipientNumber: row.recipientNumber,
    draftMessageContent,
    confirmationMessageId: question.id,
  });
  return { handled: true };
}

async function handleFirstGateDecision(
  supabase: AnySupabaseClient,
  params: DelegatedContactRequestFlowParams,
  recent: PendingDelegatedContact,
  approved: boolean,
  reply: (body: string) => Promise<void>
): Promise<DelegatedContactRequestFlowResult> {
  if (!recent.confirmationMessageId) return { handled: false };
  const claim = await claimPendingDelegatedContactDecision(supabase, {
    id: recent.id,
    expectedConfirmationMessageId: recent.confirmationMessageId,
    decisionMessageId: params.triggerMessageId,
    approved,
  });
  if (!claim.granted) {
    await reply('Não consegui confirmar agora — se eu já tiver perguntado de novo, responda a pergunta mais recente.');
    return { handled: true };
  }
  if (!approved) {
    await reply('Tudo bem, não vou enviar essa mensagem.');
    return { handled: true };
  }

  await executeTemplateSend(supabase, { id: recent.id, channel: params.channel });
  return { handled: true };
}

// Template inicial — requisito explícito (1): nunca diz "enviei",
// porque neste ponto o outbound_intent só foi CRIADO (delivery_state
// nasce 'policy_allowed'), a entrega real é assíncrona (cron
// send-outbound-intents, inalterado). Nunca afirma que a mensagem
// ORIGINAL foi mandada — ela só segue depois da resposta do
// destinatário (restrição real da WhatsApp Cloud API, nunca escolha
// de produto).
async function executeTemplateSend(supabase: AnySupabaseClient, params: { id: string; channel: string }): Promise<void> {
  const claim = await claimPendingDelegatedContactForTemplateExecution(supabase, { id: params.id, workerId: 'inline:professional_self' });
  if (!claim.granted) return; // outro worker já está executando/executou — nunca reenvia

  try {
    const participant = await resolveOrCreateExternalParticipant(supabase, {
      professionalId: claim.requestingProfessionalId,
      channel: 'whatsapp',
      identifier: claim.recipientNumber,
      name: claim.recipientName,
    });
    const conversation = await createDelegatedContactConversation(supabase, { professionalId: claim.requestingProfessionalId, externalParticipantId: participant.id });
    const displayName = await resolveProfessionalDisplayName(supabase, claim.requestingProfessionalId);
    const outboundIntent = await createOutboundIntent(supabase, {
      conversationId: conversation.id,
      triggerMessageId: null,
      runId: null,
      policyDecisionId: null,
      channel: 'whatsapp',
      recipientExternalParticipantId: participant.id,
      content: renderColdOutreachTemplateContent(displayName ?? 'a profissional'),
      sendAs: 'template',
      requiresProfessionalReview: false,
    });
    await markPendingDelegatedContactExecuted(supabase, {
      id: params.id,
      createdConversationId: conversation.id,
      createdOutboundIntentId: outboundIntent.id,
      noReplyHours: DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS,
    });
    await replyToProfessional(supabase, {
      conversationId: claim.conversationId,
      professionalId: claim.requestingProfessionalId,
      channel: params.channel,
      body: `Coloquei o contato inicial com ${claim.recipientName ?? claim.recipientNumber} na fila de envio. Como ela/ele nunca falou com a Doopla, o primeiro contato é uma mensagem de apresentação padrão (exigência da própria Meta/WhatsApp) — sua mensagem original só pode seguir depois que ela/ele responder. Vou te avisar.`,
    });
  } catch {
    await markPendingDelegatedContactFailed(supabase, { id: params.id });
    await replyToProfessional(supabase, {
      conversationId: claim.conversationId,
      professionalId: claim.requestingProfessionalId,
      channel: params.channel,
      body: 'Não consegui iniciar esse contato agora. Pode tentar de novo em alguns minutos.',
    }).catch(() => {
      // Nunca derruba o fluxo por falha de notificação best-effort.
    });
  }
}

async function handleSecondGateDecision(
  supabase: AnySupabaseClient,
  recent: PendingDelegatedContact,
  decisionMessageId: string,
  approved: boolean,
  reply: (body: string) => Promise<void>
): Promise<DelegatedContactRequestFlowResult> {
  if (!recent.literalContentConfirmationMessageId) return { handled: false };
  const claim = await claimPendingDelegatedContactLiteralContentDecision(supabase, {
    id: recent.id,
    expectedConfirmationMessageId: recent.literalContentConfirmationMessageId,
    decisionMessageId,
    approved,
  });
  if (!claim.granted) {
    await reply('Não consegui registrar essa decisão agora — se eu já tiver perguntado de novo, responda a pergunta mais recente.');
    return { handled: true };
  }
  if (!approved) {
    await reply('Tudo bem, não vou enviar a mensagem original para ela/ele.');
    return { handled: true };
  }
  await executeLiteralContentSend(supabase, recent.id);
  return { handled: true };
}

async function handleStatusInquiry(supabase: AnySupabaseClient, recent: PendingDelegatedContact, reply: (body: string) => Promise<void>): Promise<DelegatedContactRequestFlowResult> {
  await reply(await describeStatus(supabase, recent));
  return { handled: true };
}

// Única fonte de verdade da resposta a "enviou?"/"já mandou?" — lê o
// delivery_state REAL dos outbound_intents envolvidos, nunca inventa.
// Requisito explícito (3): nunca promete entrega sem confirmação.
async function describeStatus(supabase: AnySupabaseClient, recent: PendingDelegatedContact): Promise<string> {
  const who = recent.recipientName ?? recent.recipientNumber ?? 'o contato pedido';

  if (recent.status === 'pending_number') return `Ainda não tenho o número de ${who} — pode me mandar?`;
  if (recent.status === 'pending_approval') return `Ainda estou esperando sua confirmação pra começar o contato com ${who}.`;
  if (recent.status === 'rejected' || recent.status === 'cancelled') return `Esse pedido foi cancelado antes de eu enviar qualquer coisa para ${who}.`;
  if (recent.status === 'expired') return `Esse pedido expirou antes de você confirmar — se ainda quiser, pode pedir de novo.`;
  if (recent.status === 'failed') return `Não consegui iniciar o contato com ${who} por uma falha técnica. Quer que eu tente de novo?`;
  if (recent.status === 'expired_no_reply') return `${who} nunca respondeu ao contato inicial e o prazo de ${DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS}h passou. Quer que eu tente de outro jeito?`;
  if (recent.status === 'executing') return `Estou iniciando o contato com ${who} agora, só um momento.`;

  // status === 'executed': o template já foi criado — o que falta
  // saber é o estado real de cada envio (template x texto literal).
  const templateState = recent.createdOutboundIntentId ? await fetchOutboundIntentDeliveryState(supabase, recent.createdOutboundIntentId) : null;
  const templateFailed = templateState === 'failed_transient' || templateState === 'failed_permanent';
  const templateDescription = describeDeliveryState(templateState, {
    sent: `Mandei o contato inicial para ${who}`,
    queued: `Coloquei o contato inicial para ${who} na fila de envio`,
    failed: `Tentei mandar o contato inicial para ${who}, mas falhou`,
  });

  if (recent.literalContentGate === 'awaiting_recipient_reply') {
    // Achado real em teste controlado em produção (14/10/2026): quando
    // o template falha, não existe "resposta pendente" nenhuma — o
    // destinatário nunca recebeu nada para responder. Dizer "ainda não
    // respondeu" nesse caso é enganoso; o pedido certo é tentar
    // reenviar o template, não esperar uma resposta que nunca vai vir.
    if (templateFailed) return `${templateDescription}. Por isso ainda não dá pra enviar sua mensagem original. Quer que eu tente mandar o contato inicial de novo?`;
    return `${templateDescription}, mas ela/ele ainda não respondeu. Sua mensagem original só segue depois disso.`;
  }
  if (recent.literalContentGate === 'awaiting_recipient_review') return `${who} respondeu, mas de um jeito que não ficou claro se posso seguir. Ainda aguardando sua decisão sobre isso.`;
  if (recent.literalContentGate === 'declined_by_recipient') return `${who} respondeu de um jeito que indica recusa, então não enviei sua mensagem original.`;
  if (recent.literalContentGate === 'approved_to_send') return `${templateDescription}. Vou enviar sua mensagem original agora.`;
  if (recent.literalContentGate === 'sending') return `Estou enviando sua mensagem original para ${who} agora, só um momento.`;
  if (recent.literalContentGate === 'failed') return `${templateDescription}, mas não consegui enviar sua mensagem original por uma falha técnica. Quer que eu tente de novo?`;
  // 'sent'
  const literalState = recent.literalContentOutboundIntentId ? await fetchOutboundIntentDeliveryState(supabase, recent.literalContentOutboundIntentId) : null;
  return describeDeliveryState(literalState, {
    sent: `Sua mensagem original para ${who} foi enviada`,
    queued: `Sua mensagem original para ${who} está na fila de envio`,
    failed: `Tentei enviar sua mensagem original para ${who}, mas falhou`,
  });
}

async function fetchOutboundIntentDeliveryState(supabase: AnySupabaseClient, outboundIntentId: string): Promise<string | null> {
  const { data } = await supabase.from('outbound_intents').select('delivery_state').eq('id', outboundIntentId).maybeSingle();
  return (data as { delivery_state: string } | null)?.delivery_state ?? null;
}

function describeDeliveryState(state: string | null, phrasing: { sent: string; queued: string; failed: string }): string {
  switch (state) {
    case 'delivered':
    case 'read':
      return `${phrasing.sent} e foi entregue.`;
    case 'sent_confirmed':
      return `${phrasing.sent} e o WhatsApp confirmou o envio (ainda sem confirmação de entrega).`;
    case 'sent_unknown':
      return `${phrasing.sent}, mas não tenho confirmação se chegou. Pode ter falhado silenciosamente.`;
    case 'failed_transient':
    case 'failed_permanent':
      return `${phrasing.failed}.`;
    case 'queued':
    case 'sending':
    case 'policy_allowed':
      return `${phrasing.queued}, ainda não confirmado pelo WhatsApp.`;
    default:
      return `${phrasing.queued}.`;
  }
}

// ============================================================
// Entrada B — 1ª resposta real do destinatário (pipeline.ts, ramo da
// conversation criada por esta funcionalidade).
// ============================================================

export type DelegatedContactRecipientReplyFlowParams = {
  conversationId: string;
  messageId: string;
  messageText: string;
};

export type DelegatedContactRecipientReplyFlowOpts = {
  consentModelCall?: RecipientConsentCheckModelCall;
  consentMaxRetries?: number;
};

export async function runDelegatedContactRecipientReplyFlow(
  supabase: AnySupabaseClient,
  params: DelegatedContactRecipientReplyFlowParams,
  opts: DelegatedContactRecipientReplyFlowOpts = {}
): Promise<{ handled: boolean }> {
  const pdc = await getPendingDelegatedContactAwaitingReplyByConversation(supabase, { conversationId: params.conversationId });
  if (!pdc) return { handled: false };

  const consent = await checkRecipientConsent(params.messageText, { modelCall: opts.consentModelCall, maxRetries: opts.consentMaxRetries });
  const set = await setPendingDelegatedContactRecipientReply(supabase, { id: pdc.id, messageId: params.messageId, outcome: consent.outcome });
  if (!set) return { handled: true }; // já processado (concorrência) — nunca reprocessa

  if (consent.outcome === 'declined') {
    await replyToProfessional(supabase, {
      conversationId: pdc.conversationId,
      professionalId: pdc.requestingProfessionalId,
      channel: 'whatsapp',
      body: `${pdc.recipientName ?? 'O contato'} respondeu de um jeito que parece recusa ou pedido pra não ser contatado: "${params.messageText}". Não enviei sua mensagem original.`,
    });
    return { handled: true };
  }

  if (consent.outcome === 'ambiguous') {
    const questionBody = `${pdc.recipientName ?? 'O contato'} respondeu: "${params.messageText}". Não ficou claro se posso seguir com sua mensagem original. Posso enviar mesmo assim?`;
    const question = await persistAiMessage(supabase, { conversationId: pdc.conversationId, contentType: 'text', body: questionBody });
    await sendProfessionalSelfReplyViaWhatsapp(supabase, { professionalId: pdc.requestingProfessionalId, body: questionBody });
    await preparePendingDelegatedContactLiteralContentReview(supabase, { id: pdc.id, confirmationMessageId: question.id });
    return { handled: true };
  }

  // 'proceed'
  await executeLiteralContentSend(supabase, pdc.id);
  return { handled: true };
}

// Envio do TEXTO LITERAL — máquina independente da do template (claim
// próprio). Requisito explícito (2): idempotência separada; requisito
// (1): nunca diz "enviada" aqui, só "na fila" (delivery_state real só
// se confirma depois, via send-outbound-intents, inalterado).
async function executeLiteralContentSend(supabase: AnySupabaseClient, id: string): Promise<void> {
  const claim = await claimPendingDelegatedContactForLiteralContentSend(supabase, { id, workerId: 'inline:delegated-contact' });
  if (!claim.granted) return; // outro worker já está enviando/enviou — nunca reenvia

  try {
    // Participante já existe desde a execução do template — resolve
    // (idempotente, nunca cria de novo) em vez de assumir que
    // claim.conversationId sozinho basta pra achar o id.
    const participant = await resolveOrCreateExternalParticipant(supabase, {
      professionalId: claim.requestingProfessionalId,
      channel: 'whatsapp',
      identifier: claim.recipientNumber,
      name: null,
    });
    const outboundIntent = await createOutboundIntent(supabase, {
      conversationId: claim.conversationId, // created_conversation_id (externa) — ver comentário na migration 0109
      triggerMessageId: null,
      runId: null,
      policyDecisionId: null,
      channel: 'whatsapp',
      recipientExternalParticipantId: participant.id,
      content: claim.draftMessageContent,
      sendAs: 'free_text',
      requiresProfessionalReview: false,
    });
    await markPendingDelegatedContactLiteralContentSent(supabase, { id, outboundIntentId: outboundIntent.id });
    await replyToProfessional(supabase, {
      conversationId: claim.professionalSelfConversationId,
      professionalId: claim.requestingProfessionalId,
      channel: 'whatsapp',
      body: 'Coloquei sua mensagem original na fila de envio.',
    });
  } catch {
    await markPendingDelegatedContactLiteralContentFailed(supabase, { id });
  }
}

// ============================================================
// Recuperação (cron) — requisito explícito (2): idempotência sob
// crash/concorrência. executeTemplateSend/executeLiteralContentSend
// já derivam TUDO do claim atômico (nunca de um parâmetro externo
// frágil) — recuperar uma lease vencida é literalmente chamar a mesma
// function de novo com só o id; se outro worker já tiver terminado
// primeiro, o claim simplesmente falha (granted=false) e nada
// acontece duas vezes.
// ============================================================

export async function recoverStuckTemplateExecutions(supabase: AnySupabaseClient, ids: string[]): Promise<void> {
  for (const id of ids) {
    await executeTemplateSend(supabase, { id, channel: 'whatsapp' });
  }
}

export async function recoverStuckLiteralContentSends(supabase: AnySupabaseClient, ids: string[]): Promise<void> {
  for (const id of ids) {
    await executeLiteralContentSend(supabase, id);
  }
}

// ============================================================
// Sweep (cron) — requisito explícito (4): nunca fica pendente
// indefinidamente quando o destinatário nunca responde.
// ============================================================

export async function sweepDelegatedContactExpirations(supabase: AnySupabaseClient, ids: { dueForNoReply: string[] }): Promise<{ expiredNoReply: number }> {
  let expiredNoReply = 0;
  for (const id of ids.dueForNoReply) {
    const row = await markPendingDelegatedContactExpiredNoReply(supabase, { id });
    if (!row) continue; // já não era mais elegível (idempotência) — nunca avisa duas vezes
    expiredNoReply++;
    await replyToProfessional(supabase, {
      conversationId: row.conversationId,
      professionalId: row.requestingProfessionalId,
      channel: 'whatsapp',
      body: `${row.recipientName ?? 'O contato'} nunca respondeu ao contato inicial e o prazo de ${DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS}h passou. Encerrei essa tentativa. Quer que eu tente de outro jeito?`,
    }).catch(() => {
      // Nunca derruba o sweep por falha de notificação best-effort —
      // mesmo padrão de sendProfessionalSelfReplyViaWhatsapp.
    });
  }
  return { expiredNoReply };
}
