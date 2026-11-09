import { apiBaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// Espelha src/lib/whatsapp-identity/data.ts (painel web) — mesma
// tabela (professional_whatsapp_identities, migration 0064), mesma
// RLS "select own". Cópia deliberada. NÃO constrói UI aqui — as
// telas de solicitar/confirmar/revogar OTP continuam fora deste
// bloco (Foundation só prepara os boundaries).
//
// Regra canônica preservada: telefone informado ≠ identidade
// confiável. null = nenhuma linha ainda, nunca fabricado.
//
// requestWhatsappVerification() NUNCA chama a RPC direto — o envio
// real do código usa WHATSAPP_ACCESS_TOKEN (segredo de servidor, nunca
// no client), então passa pela rota de API do painel web
// (src/app/api/mobile/whatsapp-identity/request/route.ts), mesmo
// racional de sendProfessionalReply em data/conversations.ts.
// confirm/revoke não expõem segredo nenhum — chamam a RPC direto.

export type WhatsappIdentityStatus = 'unverified' | 'pending_verification' | 'verified' | 'pending_replacement' | 'revoked';

export type WhatsappIdentitySnapshot = {
  status: WhatsappIdentityStatus;
  verifiedNumber: string | null;
  verifiedAt: string | null;
  candidateNumber: string | null;
  candidateRequestedAt: string | null;
};

type RawIdentityRow = {
  status: WhatsappIdentityStatus;
  verified_number: string | null;
  verified_at: string | null;
  candidate_number: string | null;
  candidate_requested_at: string | null;
};

export async function fetchWhatsappIdentitySnapshot(professionalId: string): Promise<WhatsappIdentitySnapshot | null> {
  const { data, error } = await supabase
    .from('professional_whatsapp_identities')
    .select('status, verified_number, verified_at, candidate_number, candidate_requested_at')
    .eq('professional_id', professionalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RawIdentityRow;
  return {
    status: row.status,
    verifiedNumber: row.verified_number,
    verifiedAt: row.verified_at,
    candidateNumber: row.candidate_number,
    candidateRequestedAt: row.candidate_requested_at,
  };
}

export type RequestWhatsappVerificationResult = { kind: 'sent'; expiresAt: string } | { kind: 'error'; error: string };

export async function requestWhatsappVerification(candidateNumber: string, accessToken: string): Promise<RequestWhatsappVerificationResult> {
  const response = await fetch(`${apiBaseUrl()}/api/mobile/whatsapp-identity/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ candidateNumber }),
  });
  const result = (await response.json()) as RequestWhatsappVerificationResult;
  if (!response.ok && result.kind !== 'error') {
    throw new Error(`Falha ao solicitar verificação (HTTP ${response.status})`);
  }
  return result;
}

// confirm/revoke não expõem nenhum segredo (nunca retornam o código
// puro, nunca enviam WhatsApp) — chamadas diretas via RPC, mesmas 3
// já usadas pelo Web (auth.uid()=p_professional_id sempre exigido
// dentro da function, nunca is_system_caller()).
export async function confirmWhatsappVerification(professionalId: string, code: string) {
  const { data, error } = await supabase.rpc('confirm_whatsapp_verification', { p_professional_id: professionalId, p_code: code }).single();
  if (error) throw error;
  return data as { confirmed: boolean; reason: string | null };
}

export async function revokeWhatsappVerification(professionalId: string) {
  const { data, error } = await supabase.rpc('revoke_whatsapp_verification', { p_professional_id: professionalId });
  if (error) throw error;
  return data === true;
}
