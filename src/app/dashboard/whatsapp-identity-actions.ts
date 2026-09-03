'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { sendWhatsappTextMessage } from '@/lib/channels/whatsapp/client';
import { normalizeWhatsappPhone } from '@/lib/channels/whatsapp/phone';
import { whatsappAccessToken, whatsappPhoneNumberId } from '@/lib/supabase/env';

// Doopla Intelligence Core v1 — Professional WhatsApp Identity: único
// boundary de escrita do vínculo professional_id <-> verified_whatsapp_number.
// Server Actions finas, nunca lógica de negócio aqui — tudo isso vive
// nas 3 RPCs (migration 0064), que revalidam auth.uid() = p_professional_id
// internamente, nunca is_system_caller(). Nenhuma UI nova neste bloco
// (a tela de configurações que chama isto vem depois) — só o boundary
// necessário pra existir e ser testável ponta a ponta.

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export type RequestWhatsappVerificationResult =
  | { kind: 'sent'; expiresAt: string }
  | { kind: 'error'; error: string };

// Gera o código (RPC, hash gravado, nunca texto puro persistido),
// manda via WhatsApp (client de baixo nível, mesmo usado pelo sender
// de outbound_intents) — o código só existe em texto puro entre estas
// duas linhas, nunca antes nem depois.
export async function requestWhatsappVerificationAction(params: { candidateNumber: string }): Promise<RequestWhatsappVerificationResult> {
  const { supabase, user } = await requireProfessional();

  const normalized = normalizeWhatsappPhone(params.candidateNumber);
  if (!normalized) {
    return { kind: 'error', error: 'Número inválido — confira o DDD e o número.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;

  const { data, error } = await client
    .rpc('request_whatsapp_verification', { p_professional_id: user.id, p_candidate_number: normalized })
    .single<{ challenge_id: string; code: string; expires_at: string }>();

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

export type ConfirmWhatsappVerificationResult = { kind: 'confirmed' } | { kind: 'error'; error: string };

export async function confirmWhatsappVerificationAction(params: { code: string }): Promise<ConfirmWhatsappVerificationResult> {
  const { supabase, user } = await requireProfessional();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;

  const { data, error } = await client
    .rpc('confirm_whatsapp_verification', { p_professional_id: user.id, p_code: params.code.trim() })
    .single<{ confirmed: boolean; reason: string | null }>();

  if (error || !data) {
    return { kind: 'error', error: `Não foi possível confirmar: ${error?.message ?? 'sem dado'}` };
  }
  if (!data.confirmed) {
    const messages: Record<string, string> = {
      no_pending_challenge: 'Nenhuma verificação em aberto — peça um código novo.',
      expired: 'Esse código expirou — peça um novo.',
      too_many_attempts: 'Muitas tentativas erradas — peça um código novo.',
      invalid_code: 'Código incorreto.',
      number_claimed_by_another_professional: 'Esse número já está verificado por outra conta.',
    };
    return { kind: 'error', error: messages[data.reason ?? ''] ?? 'Não foi possível confirmar o código.' };
  }
  return { kind: 'confirmed' };
}

export type RevokeWhatsappVerificationResult = { kind: 'revoked'; hadVerification: boolean } | { kind: 'error'; error: string };

export async function revokeWhatsappVerificationAction(): Promise<RevokeWhatsappVerificationResult> {
  const { supabase, user } = await requireProfessional();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;

  const { data, error } = await client.rpc('revoke_whatsapp_verification', { p_professional_id: user.id });
  if (error) {
    return { kind: 'error', error: `Não foi possível remover a verificação: ${error.message}` };
  }
  return { kind: 'revoked', hadVerification: data === true };
}
