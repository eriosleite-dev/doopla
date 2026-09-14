import type { SupabaseClient } from '@supabase/supabase-js';

import { sendWhatsappTextMessage } from '@/lib/channels/whatsapp/client';
import { normalizeWhatsappPhone } from '@/lib/channels/whatsapp/phone';
import { whatsappAccessToken, whatsappPhoneNumberId } from '@/lib/supabase/env';
import type { Database } from '@/lib/supabase/types';

// Professional Product UI — Foundation. Boundary ÚNICO de
// requestWhatsappVerification, extraído de
// src/app/dashboard/whatsapp-identity-actions.ts pra ser compartilhado
// por Web (Server Action, sessão de cookie) e Mobile (rota de API,
// sessão via Bearer) — mesmo racional de
// src/lib/beta-integration/professional-reply.ts.
//
// CRÍTICO, por que este boundary precisa ser server-side dos dois
// lados (nunca uma chamada RPC direta do Mobile, ao contrário de
// confirm/revoke): request_whatsapp_verification devolve o código OTP
// em TEXTO PURO (única vez que ele existe fora do hash) — o envio real
// pelo WhatsApp usa WHATSAPP_ACCESS_TOKEN, um segredo de servidor que
// NUNCA pode chegar ao client/mobile. Se o Mobile chamasse a RPC
// diretamente, o código sairia em texto puro pro dispositivo sem
// ninguém nunca mandar ele por WhatsApp de verdade (ou pior, exigiria
// o app carregar o token do WhatsApp Business API, uma violação de
// segurança). Por isso esta function só é chamável de dentro de um
// server real (Server Action ou Route Handler), nunca exposta como
// RPC direta pro Mobile.
export type RequestWhatsappVerificationResult = { kind: 'sent'; expiresAt: string } | { kind: 'error'; error: string };

export async function requestWhatsappVerification(
  supabase: SupabaseClient<Database>,
  professionalId: string,
  candidateNumber: string
): Promise<RequestWhatsappVerificationResult> {
  const normalized = normalizeWhatsappPhone(candidateNumber);
  if (!normalized) {
    return { kind: 'error', error: 'Número inválido — confira o DDD e o número.' };
  }

  const { data, error } = await supabase
    .rpc('request_whatsapp_verification', { p_professional_id: professionalId, p_candidate_number: normalized })
    .single();

  if (error || !data) {
    if (error?.message.includes('resend_too_soon')) {
      return { kind: 'error', error: 'Aguarde alguns segundos antes de pedir um novo código.' };
    }
    if (error?.message.includes('too_many_requests')) {
      return { kind: 'error', error: 'Muitas tentativas — aguarde um pouco antes de pedir outro código.' };
    }
    return { kind: 'error', error: `Não foi possível gerar o código: ${error?.message ?? 'sem dado'}` };
  }

  const send = await sendWhatsappTextMessage(
    { accessToken: whatsappAccessToken(), phoneNumberId: whatsappPhoneNumberId() },
    { to: normalized, body: `Seu código Doopla de verificação: ${data.code}. Válido por 10 minutos.` }
  );
  if (send.kind === 'failed_permanent') {
    return { kind: 'error', error: 'Não foi possível enviar o código pra este número pelo WhatsApp.' };
  }
  // sent_unknown/failed_transient: código já existe (hash gravado),
  // profissional pode tentar reenviar depois do cooldown — nunca
  // reexpõe o código puro numa segunda tentativa manual.

  return { kind: 'sent', expiresAt: data.expires_at };
}
