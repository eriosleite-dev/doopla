'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { requestWhatsappVerification, type RequestWhatsappVerificationResult } from '@/lib/whatsapp-identity/request-verification';

// Doopla Intelligence Core v1 — Professional WhatsApp Identity: único
// boundary de escrita do vínculo professional_id <-> verified_whatsapp_number.
// Server Actions finas, nunca lógica de negócio aqui — tudo isso vive
// nas 3 RPCs (migration 0064), que revalidam auth.uid() = p_professional_id
// internamente, nunca is_system_caller(). Nenhuma UI nova neste bloco
// (a tela de configurações que chama isto vem depois) — só o boundary
// necessário pra existir e ser testável ponta a ponta.
//
// Professional Product UI — Foundation: requestWhatsappVerificationAction
// agora delega pro boundary compartilhado com o Mobile
// (src/lib/whatsapp-identity/request-verification.ts) — mesmo padrão
// já usado em professional-reply-action.ts/submitProfessionalReply.

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export type { RequestWhatsappVerificationResult };

export async function requestWhatsappVerificationAction(params: { candidateNumber: string }): Promise<RequestWhatsappVerificationResult> {
  const { supabase, user } = await requireProfessional();
  return requestWhatsappVerification(supabase, user.id, params.candidateNumber);
}

export type ConfirmWhatsappVerificationResult = { kind: 'confirmed' } | { kind: 'error'; error: string };

export async function confirmWhatsappVerificationAction(params: { code: string }): Promise<ConfirmWhatsappVerificationResult> {
  const { supabase, user } = await requireProfessional();

  const { data, error } = await supabase
    .rpc('confirm_whatsapp_verification', { p_professional_id: user.id, p_code: params.code.trim() })
    .single();

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

  const { data, error } = await supabase.rpc('revoke_whatsapp_verification', { p_professional_id: user.id });
  if (error) {
    return { kind: 'error', error: `Não foi possível remover a verificação: ${error.message}` };
  }
  return { kind: 'revoked', hadVerification: data === true };
}
