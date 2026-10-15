import { NextResponse, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { markOutboundIntentDelivered, markOutboundIntentRead } from '@/lib/runtime';
import { handleWhatsappInboundMessage, type WhatsappInboundHandlerResult } from '@/lib/channels/whatsapp/intake-orchestration';
import { normalizeWhatsappPhone } from '@/lib/channels/whatsapp/phone';
import { captureWhatsappInboundRawMessage, claimWhatsappInboundRawCaptureForProcessing, classifyWhatsappInboundResultForCapture, finishWhatsappInboundRawCapture } from '@/lib/channels/whatsapp/raw-captures';
import { verifyWhatsappWebhookChallenge, verifyWhatsappWebhookSignature } from '@/lib/channels/whatsapp/webhook-verify';
import { whatsappAppSecret, whatsappWebhookVerifyToken } from '@/lib/supabase/env';

// Doopla Intelligence Core v1 — canal WhatsApp (passo 6A+6B, WhatsApp
// Inbound Foundation): único ponto que recebe webhooks reais da Meta.
// Nunca chama nada do Runtime/Intelligence Core diretamente além de
// triggerInboundMessage — feito indiretamente aqui via
// handleWhatsappInboundMessage (intake-orchestration.ts), que resolve
// identidade/conversa (inclusive contato novo/ambíguo, WhatsApp
// Inbound Foundation) e só então entrega pro boundary já existente.
// Nunca reimplementa nada do Runtime.
//
// Fase 1 (ADR 0002, 15/10/2026) — duas passagens explícitas sobre toda
// mensagem de texto elegível do lote, nunca uma só:
//   Passagem 1 — captura durável e idempotente (migration 0112), ANTES
//   de qualquer roteamento. Decide o status HTTP: se qualquer captura
//   falhar, a resposta é 503 pro LOTE inteiro (Meta reentrega — seguro,
//   a captura já feita não duplica, ON CONFLICT DO NOTHING).
//   Passagem 2 — processamento best-effort, isolado por mensagem,
//   idêntico ao comportamento de antes da Fase 1, NUNCA afeta o status
//   HTTP. Reclama a captura primeiro (claim_whatsapp_inbound_raw_capture_for_processing)
//   pra nunca processar o MESMO wamid em paralelo com outra entrega
//   concorrente do mesmo lote (ou uma reentrega). Marca a captura como
//   completed/needs_attention só com evidência real do que aconteceu —
//   nunca otimista (ver finishCaptureForResult abaixo).

const RAW_CAPTURE_WORKER_ID = 'whatsapp:webhook';

// ============================================================
// GET — handshake de verificação (configurado uma vez no painel da
// Meta, ao registrar a URL do webhook).
// ============================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = verifyWhatsappWebhookChallenge({
    mode: searchParams.get('hub.mode'),
    verifyToken: searchParams.get('hub.verify_token'),
    challenge: searchParams.get('hub.challenge'),
    expectedVerifyToken: whatsappWebhookVerifyToken(),
  });
  if (challenge === null) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

// ============================================================
// POST — mensagens inbound + eventos de status assíncrono
// (delivered/read). Corpo BRUTO lido antes de qualquer parse — a
// assinatura é sobre os bytes exatos que a Meta enviou.
// ============================================================
type WhatsappWebhookMessage = { id: string; from: string; type: string; timestamp?: string; text?: { body: string } };
type WhatsappWebhookStatus = { id: string; status: string };
type WhatsappWebhookContact = { wa_id?: string; profile?: { name?: string } };
type WhatsappWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsappWebhookMessage[];
        statuses?: WhatsappWebhookStatus[];
        contacts?: WhatsappWebhookContact[];
      };
    }>;
  }>;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyWhatsappWebhookSignature(rawBody, signature, whatsappAppSecret())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: WhatsappWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsappWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Coleta todas as mensagens de texto elegíveis do payload inteiro
  // (pode vir em múltiplos entry/changes) e os eventos de status, numa
  // passada só — a lista completa de elegíveis é necessária ANTES de
  // decidir o status HTTP no fim da Passagem 1.
  const eligibleMessages: Array<{ message: WhatsappWebhookMessage; body: string; contactName: string | null }> = [];
  const statusEvents: WhatsappWebhookStatus[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const contactNames = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) contactNames.set(contact.wa_id, contact.profile.name);
      }

      // Só texto nesta rodada — áudio/imagem/documento ficam fora de
      // escopo do 6A (o Runtime já suporta contentType='audio'/
      // 'attachment' em conversation_messages, mas o adapter deste
      // vertical não traduz isso ainda; decisão explícita de escopo,
      // não esquecimento). "Elegível" pra captura = exatamente este
      // mesmo filtro, nunca mais amplo.
      for (const message of value.messages ?? []) {
        if (message.type === 'text' && message.text?.body) {
          eligibleMessages.push({ message, body: message.text.body, contactName: contactNames.get(message.from) ?? null });
        }
      }
      for (const status of value.statuses ?? []) statusEvents.push(status);
    }
  }

  // Passagem 1 — captura durável e idempotente, ANTES de qualquer
  // roteamento. Se qualquer captura falhar, a Meta precisa reentregar
  // o LOTE inteiro: nunca seguimos pra Passagem 2 com uma mensagem que
  // não foi gravada ainda (ela desapareceria se o processo morresse
  // logo depois).
  let captureFailed = false;
  for (const { message, body, contactName } of eligibleMessages) {
    try {
      const timestampSeconds = message.timestamp ? parseInt(message.timestamp, 10) : null;
      await captureWhatsappInboundRawMessage(supabase, {
        providerMessageId: message.id,
        fromPhone: message.from,
        body,
        contactName,
        providerTimestampSeconds: Number.isFinite(timestampSeconds) ? timestampSeconds : null,
      });
    } catch (err) {
      captureFailed = true;
      console.error('whatsapp webhook: falha na captura durável (Passagem 1)', message.id, err);
    }
  }
  if (captureFailed) {
    return new NextResponse(null, { status: 503 });
  }

  // Passagem 2 — processamento best-effort, isolado por mensagem
  // (mesmo princípio de resumption.ts: uma mensagem ruim nunca derruba
  // as outras do lote), nunca afeta o status HTTP. Cada mensagem
  // reclama sua própria captura primeiro — nunca processa em paralelo
  // com outra entrega concorrente do mesmo wamid.
  for (const { message, body, contactName } of eligibleMessages) {
    try {
      await handleInboundMessageWithCapture(supabase, message, body, contactName);
    } catch (err) {
      console.error('whatsapp webhook: falha processando mensagem inbound (Passagem 2)', message.id, err);
    }
  }
  for (const status of statusEvents) {
    try {
      await handleStatusEvent(supabase, status);
    } catch (err) {
      console.error('whatsapp webhook: falha processando status', status.id, err);
    }
  }

  // Sempre 200 depois de autenticado e com a captura em dia — a Meta
  // reentrega agressivamente em caso de erro; erros de PROCESSAMENTO
  // (Passagem 2) já isolados por mensagem acima, nunca propagamos um
  // 5xx por causa deles (o conteúdo já está durável, uma reentrega não
  // ajudaria e só geraria trabalho repetido).
  return NextResponse.json({ ok: true });
}

// Processa UMA mensagem já capturada (Passagem 1 já rodou pra ela).
// Reclama a captura, roda o fluxo de sempre, e só marca completed
// quando o resultado devolvido é um dos que esta rodada verificou ter
// evidência durável em outro lugar (ver comentário da migration 0112
// e de cada branch abaixo) — qualquer coisa fora disso (exceção, ou um
// `kind` que esta função não reconhece) vira needs_attention, nunca
// completed por omissão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInboundMessageWithCapture(supabase: any, message: WhatsappWebhookMessage, body: string, contactName: string | null): Promise<void> {
  const claim = await claimWhatsappInboundRawCaptureForProcessing(supabase, { providerMessageId: message.id, workerId: RAW_CAPTURE_WORKER_ID });
  if (!claim.claimed) {
    // Nunca é erro: ou outra entrega já concluiu esta mensagem (nada a
    // fazer, conteúdo já durável em outro lugar), ou outra entrega tem
    // a lease viva agora (está processando de verdade neste exato
    // momento — nunca processar em paralelo com ela).
    return;
  }

  let result: WhatsappInboundHandlerResult;
  try {
    result = await handleInboundMessage(supabase, message, body, contactName);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'erro desconhecido';
    await finishWhatsappInboundRawCapture(supabase, { providerMessageId: message.id, workerId: RAW_CAPTURE_WORKER_ID, status: 'needs_attention', error: errorMessage });
    throw err; // o chamador (loop da Passagem 2) já loga, nunca duplicamos o log aqui.
  }

  // Evidência durável verificada por resultado, nunca otimista — ver
  // comentário completo em classifyWhatsappInboundResultForCapture
  // (raw-captures.ts) e em finish_whatsapp_inbound_raw_capture (0112).
  // ÚNICA implementação desta classificação (Fase 2, ADR 0002: o
  // sweep de recuperação reaproveita a MESMA function, nunca uma
  // segunda tabela de decisão que possa divergir desta).
  const { status, error } = classifyWhatsappInboundResultForCapture(result);
  await finishWhatsappInboundRawCapture(supabase, { providerMessageId: message.id, workerId: RAW_CAPTURE_WORKER_ID, status, resultKind: result.kind, error });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInboundMessage(supabase: any, message: WhatsappWebhookMessage, body: string, contactName: string | null): Promise<WhatsappInboundHandlerResult> {
  const normalizedPhone = normalizeWhatsappPhone(message.from.startsWith('+') ? message.from : `+${message.from}`);
  if (!normalizedPhone) return { kind: 'invalid_phone' };

  // WhatsApp Inbound Foundation: identidade/representação nunca mais
  // descarta um contato desconhecido — resolve (identidade verificada
  // > token determinístico > relação histórica única > menção de
  // nome, com confirmação sempre que ambíguo) ou preserva a mensagem
  // numa sessão de intake até resolver. Nunca cria conversation antes
  // de saber quem está sendo representado.
  const timestampSeconds = message.timestamp ? parseInt(message.timestamp, 10) : null;
  return await handleWhatsappInboundMessage(supabase, normalizedPhone, {
    providerMessageId: message.id,
    from: message.from,
    body,
    contactName,
    providerTimestampSeconds: Number.isFinite(timestampSeconds) ? timestampSeconds : null,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStatusEvent(supabase: any, status: WhatsappWebhookStatus) {
  if (status.status === 'delivered') {
    await markOutboundIntentDelivered(supabase, { providerMessageId: status.id });
    return;
  }
  if (status.status === 'read') {
    await markOutboundIntentRead(supabase, { providerMessageId: status.id });
    return;
  }
  // 'sent' é redundante (já sabemos pela resposta síncrona do envio).
  // 'failed' assíncrono não é tratado nesta rodada — a classificação
  // de falha do 6B acontece na resposta SÍNCRONA do envio
  // (client.ts/error-classification.ts); um "failed" que só aparece
  // depois, via webhook de status, fica fora de escopo do 6A/6B,
  // registrado explicitamente, não silenciosamente ignorado como bug.
}
