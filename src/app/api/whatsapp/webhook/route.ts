import { NextResponse, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { markOutboundIntentDelivered, markOutboundIntentRead } from '@/lib/runtime';
import { handleWhatsappInboundMessage } from '@/lib/channels/whatsapp/intake-orchestration';
import { normalizeWhatsappPhone } from '@/lib/channels/whatsapp/phone';
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

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const contactNames = new Map<string, string>();
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) contactNames.set(contact.wa_id, contact.profile.name);
      }

      for (const message of value.messages ?? []) {
        // Isolamento de falha: uma mensagem ruim nunca derruba as
        // outras do mesmo lote (mesmo princípio de resumption.ts).
        try {
          await handleInboundMessage(supabase, message, contactNames);
        } catch (err) {
          console.error('whatsapp webhook: falha processando mensagem inbound', message.id, err);
        }
      }
      for (const status of value.statuses ?? []) {
        try {
          await handleStatusEvent(supabase, status);
        } catch (err) {
          console.error('whatsapp webhook: falha processando status', status.id, err);
        }
      }
    }
  }

  // Sempre 200 depois de autenticado — a Meta reentrega agressivamente
  // em caso de erro; erros já isolados por mensagem acima, nunca
  // propagamos um 5xx que faria a Meta reenviar o LOTE inteiro de novo.
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInboundMessage(supabase: any, message: WhatsappWebhookMessage, contactNames: Map<string, string>) {
  // Só texto nesta rodada — áudio/imagem/documento ficam fora de
  // escopo do 6A (o Runtime já suporta contentType='audio'/'attachment'
  // em conversation_messages, mas o adapter deste vertical não
  // traduz isso ainda; decisão explícita de escopo, não esquecimento).
  if (message.type !== 'text' || !message.text?.body) return;

  const normalizedPhone = normalizeWhatsappPhone(message.from.startsWith('+') ? message.from : `+${message.from}`);
  if (!normalizedPhone) return;

  // WhatsApp Inbound Foundation: identidade/representação nunca mais
  // descarta um contato desconhecido — resolve (identidade verificada
  // > token determinístico > relação histórica única > menção de
  // nome, com confirmação sempre que ambíguo) ou preserva a mensagem
  // numa sessão de intake até resolver. Nunca cria conversation antes
  // de saber quem está sendo representado.
  const timestampSeconds = message.timestamp ? parseInt(message.timestamp, 10) : null;
  await handleWhatsappInboundMessage(supabase, normalizedPhone, {
    providerMessageId: message.id,
    from: message.from,
    body: message.text.body,
    contactName: contactNames.get(message.from) ?? null,
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
