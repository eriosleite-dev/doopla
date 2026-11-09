import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — ADR 0004, Rodada 5 (15/10/2026):
// wrappers finos sobre whatsapp_outreach_authorization_claims/
// whatsapp_outreach_blocklist (migration 0116) — proteção mínima de
// opt-in antes de abordagens comerciais pelo WhatsApp. Mesmo padrão de
// pending-delegated-contacts.ts: nenhuma lógica aqui, só tipar/mapear
// a chamada RPC.
//
// ATENÇÃO, repetida do comment da migration: uma
// WhatsappOutreachAuthorizationClaim é a ATESTAÇÃO da profissional,
// NUNCA consentimento verificado do destinatário — isso continua
// sendo checkRecipientConsent (professional-message.ts/
// delegated-contact-flow.ts), intocado por este módulo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type WhatsappOutreachAuthorizationClaim = {
  id: string;
  professionalId: string;
  phoneNumber: string;
  pendingDelegatedContactId: string | null;
  claimedBasis: 'professional_attestation';
  purposeSummary: string | null;
  evidenceMessageId: string | null;
  claimedAt: string;
};

type RawClaimRow = {
  id: string;
  professional_id: string;
  phone_number: string;
  pending_delegated_contact_id: string | null;
  claimed_basis: 'professional_attestation';
  purpose_summary: string | null;
  evidence_message_id: string | null;
  claimed_at: string;
};

function mapClaimRow(row: RawClaimRow): WhatsappOutreachAuthorizationClaim {
  return {
    id: row.id,
    professionalId: row.professional_id,
    phoneNumber: row.phone_number,
    pendingDelegatedContactId: row.pending_delegated_contact_id,
    claimedBasis: row.claimed_basis,
    purposeSummary: row.purpose_summary,
    evidenceMessageId: row.evidence_message_id,
    claimedAt: row.claimed_at,
  };
}

// Único jeito de uma atestação nascer — idempotente por (professionalId,
// phoneNumber), nunca duplica. NUNCA chamar achando que registra
// consentimento do destinatário (ver comment da migration 0116).
export async function createWhatsappOutreachAuthorizationClaim(
  supabase: AnySupabaseClient,
  params: { professionalId: string; phoneNumber: string; pendingDelegatedContactId: string | null; purposeSummary: string | null; evidenceMessageId: string | null }
): Promise<WhatsappOutreachAuthorizationClaim> {
  const { data, error } = await supabase
    .rpc('create_whatsapp_outreach_authorization_claim', {
      p_professional_id: params.professionalId,
      p_phone_number: params.phoneNumber,
      p_pending_delegated_contact_id: params.pendingDelegatedContactId,
      p_purpose_summary: params.purposeSummary,
      p_evidence_message_id: params.evidenceMessageId,
    })
    .single();
  if (error || !data) throw new Error(`create_whatsapp_outreach_authorization_claim falhou: ${error?.message ?? 'sem dado'}`);
  return mapClaimRow(data as RawClaimRow);
}

export async function findWhatsappOutreachAuthorizationClaim(
  supabase: AnySupabaseClient,
  params: { professionalId: string; phoneNumber: string }
): Promise<WhatsappOutreachAuthorizationClaim | null> {
  const { data, error } = await supabase
    .rpc('find_whatsapp_outreach_authorization_claim', { p_professional_id: params.professionalId, p_phone_number: params.phoneNumber })
    .maybeSingle();
  if (error) throw new Error(`find_whatsapp_outreach_authorization_claim falhou: ${error.message}`);
  return data ? mapClaimRow(data as RawClaimRow) : null;
}

// Único jeito de um bloqueio nascer — idempotente, GLOBAL por telefone
// (nunca por profissional, ver comment da migration 0116, requisito 6
// do ADR 0004 Rodada 5).
export async function createWhatsappOutreachBlock(
  supabase: AnySupabaseClient,
  params: { phoneNumber: string; sourcePendingDelegatedContactId?: string | null; sourceMessageId?: string | null; reason?: string }
): Promise<void> {
  const { error } = await supabase.rpc('create_whatsapp_outreach_block', {
    p_phone_number: params.phoneNumber,
    p_source_pending_delegated_contact_id: params.sourcePendingDelegatedContactId ?? null,
    p_source_message_id: params.sourceMessageId ?? null,
    p_reason: params.reason ?? 'declined_first_reply',
  });
  if (error) throw new Error(`create_whatsapp_outreach_block falhou: ${error.message}`);
}

// Checagem de bloqueio — SEMPRE chamada em dois pontos: antes de criar
// o outbound_intent do template (executeTemplateSend) e de novo no
// momento real do envio à Meta (send-outbound-intents), nunca só uma
// vez (requisito 7 do ADR 0004 Rodada 5).
export async function isWhatsappOutreachBlocked(supabase: AnySupabaseClient, phoneNumber: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_whatsapp_outreach_blocked', { p_phone_number: phoneNumber });
  if (error) throw new Error(`is_whatsapp_outreach_blocked falhou: ${error.message}`);
  return Boolean(data);
}
