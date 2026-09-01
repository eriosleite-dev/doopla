import { NextResponse, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import {
  claimOutboundIntentForSend,
  listClaimableOutboundIntents,
  markOutboundIntentFailed,
  markOutboundIntentSendUnknown,
  markOutboundIntentSentConfirmed,
} from '@/lib/runtime';
import { sendWhatsappTextMessage } from '@/lib/channels/whatsapp/client';
import { whatsappAccessToken, whatsappPhoneNumberId } from '@/lib/supabase/env';

// Doopla Intelligence Core v1 — Runtime, passo 6B: sender real. É
// EXECUTOR de outbound_intents já autorizados pelo Post-model Gate —
// nunca decide o que enviar, nunca é uma tool do Planner, só consome
// a state machine já existente desde a migration 0051
// (claim/mark_*, nunca chamados por nenhum caminho real até agora).
//
// Disparo: Vercel Cron (vercel.json), mesmo padrão do reconciler do
// passo 5 — menor mecanismo confiável compatível com a infra atual,
// zero fila/worker novo. Secret DEDICADO (OUTBOUND_SENDER_CRON_SECRET,
// nunca o mesmo do reconciler — decisão do usuário: separar
// credenciais de processos com capacidades diferentes, este fala com
// um provider externo, o reconciler não).
//
// 1min de cadência é o mecanismo de PROVA/recuperação deste vertical
// — não é a UX final do WhatsApp (registrado, decisão do usuário: um
// fast path via disparo imediato após a criação do outbound_intent
// pode vir depois, sem trocar outbound_intents como fonte de verdade
// nem remover este cron como rede de segurança).
export async function GET(request: NextRequest) {
  const secret = process.env.OUTBOUND_SENDER_CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const claimable = await listClaimableOutboundIntents(supabase, { channel: 'whatsapp', limit: 50 });

  const results: Array<{ outboundIntentId: string; outcome: string }> = [];
  for (const intent of claimable) {
    try {
      results.push(await sendOneOutboundIntent(supabase, intent));
    } catch (err) {
      results.push({ outboundIntentId: intent.id, outcome: `error: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function sendOneOutboundIntent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  intent: { id: string; recipientExternalParticipantId: string | null; content: string }
): Promise<{ outboundIntentId: string; outcome: string }> {
  const claim = await claimOutboundIntentForSend(supabase, { outboundIntentId: intent.id, workerId: 'cron:send-outbound-intents' });
  if (!claim.granted || !claim.sendAttemptId) {
    // Outro worker já pegou, ou não estava mais em estado reclamável
    // (concorrência normal — mesmo raciocínio de begin_runtime_pending_reply_attempt).
    return { outboundIntentId: intent.id, outcome: 'not_claimed' };
  }
  const sendAttemptId = claim.sendAttemptId;

  if (!intent.recipientExternalParticipantId) {
    await markOutboundIntentFailed(supabase, { outboundIntentId: intent.id, sendAttemptId, permanent: true, reason: 'sem recipient_external_participant_id' });
    return { outboundIntentId: intent.id, outcome: 'failed_permanent: sem destinatário' };
  }

  const { data: identityRow } = await supabase
    .from('external_participant_channel_identities')
    .select('identifier')
    .eq('external_participant_id', intent.recipientExternalParticipantId)
    .eq('channel', 'whatsapp')
    .maybeSingle();
  const identity = identityRow as { identifier: string } | null;

  if (!identity) {
    await markOutboundIntentFailed(supabase, { outboundIntentId: intent.id, sendAttemptId, permanent: true, reason: 'nenhuma identidade whatsapp encontrada pro destinatário' });
    return { outboundIntentId: intent.id, outcome: 'failed_permanent: identidade não encontrada' };
  }

  const result = await sendWhatsappTextMessage(
    { accessToken: whatsappAccessToken(), phoneNumberId: whatsappPhoneNumberId() },
    { to: identity.identifier, body: intent.content }
  );

  switch (result.kind) {
    case 'sent_confirmed':
      await markOutboundIntentSentConfirmed(supabase, { outboundIntentId: intent.id, sendAttemptId, providerMessageId: result.providerMessageId });
      return { outboundIntentId: intent.id, outcome: 'sent_confirmed' };
    case 'sent_unknown':
      await markOutboundIntentSendUnknown(supabase, { outboundIntentId: intent.id, sendAttemptId });
      return { outboundIntentId: intent.id, outcome: 'sent_unknown' };
    case 'failed_transient':
      await markOutboundIntentFailed(supabase, { outboundIntentId: intent.id, sendAttemptId, permanent: false, reason: result.reason });
      return { outboundIntentId: intent.id, outcome: `failed_transient: ${result.reason}` };
    case 'failed_permanent':
      await markOutboundIntentFailed(supabase, { outboundIntentId: intent.id, sendAttemptId, permanent: true, reason: result.reason });
      return { outboundIntentId: intent.id, outcome: `failed_permanent: ${result.reason}` };
  }
}
