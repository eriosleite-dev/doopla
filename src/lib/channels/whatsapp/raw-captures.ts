import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Fase 1 (ADR 0002): wrappers finos
// sobre capture_whatsapp_inbound_raw_message/
// claim_whatsapp_inbound_raw_capture_for_processing/
// finish_whatsapp_inbound_raw_capture (migration 0112). Nenhuma lógica
// além de tipar a chamada — a idempotência/concorrência real é 100%
// SQL (mesmo princípio de inbound-events.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export async function captureWhatsappInboundRawMessage(
  supabase: AnySupabaseClient,
  params: { providerMessageId: string; fromPhone: string; body: string; contactName: string | null; providerTimestampSeconds: number | null }
): Promise<{ id: string; status: string }> {
  const { data, error } = await supabase
    .rpc('capture_whatsapp_inbound_raw_message', {
      p_provider_message_id: params.providerMessageId,
      p_from_phone: params.fromPhone,
      p_body: params.body,
      p_contact_name: params.contactName,
      p_provider_timestamp_seconds: params.providerTimestampSeconds,
    })
    .single();
  if (error || !data) throw new Error(`capture_whatsapp_inbound_raw_message falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { id: string; status: string };
  return { id: row.id, status: row.status };
}

export type ClaimWhatsappInboundRawCaptureResult = { claimed: boolean; captureId: string | null; attemptCount: number | null };

export async function claimWhatsappInboundRawCaptureForProcessing(
  supabase: AnySupabaseClient,
  params: { providerMessageId: string; workerId: string; leaseSeconds?: number }
): Promise<ClaimWhatsappInboundRawCaptureResult> {
  const { data, error } = await supabase
    .rpc('claim_whatsapp_inbound_raw_capture_for_processing', {
      p_provider_message_id: params.providerMessageId,
      p_worker_id: params.workerId,
      p_lease_seconds: params.leaseSeconds ?? 300,
    })
    .single();
  if (error || !data) throw new Error(`claim_whatsapp_inbound_raw_capture_for_processing falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { claimed: boolean; capture_id: string | null; attempt_count: number | null };
  return { claimed: row.claimed, captureId: row.capture_id, attemptCount: row.attempt_count };
}

export async function finishWhatsappInboundRawCapture(
  supabase: AnySupabaseClient,
  // 'delegated' (achado da revisão do Head of AI, 15/10/2026): distinto
  // de 'completed' — conteúdo já durável, mas noutro mecanismo (ex.:
  // professional_self_pending_messages) que AINDA está com uma
  // tentativa ativa em andamento, não um resultado definitivo. Ver
  // comentário completo em finish_whatsapp_inbound_raw_capture (0112).
  params: { providerMessageId: string; workerId: string; status: 'completed' | 'delegated' | 'needs_attention'; resultKind?: string | null; error?: string | null }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_whatsapp_inbound_raw_capture', {
    p_provider_message_id: params.providerMessageId,
    p_worker_id: params.workerId,
    p_status: params.status,
    p_result_kind: params.resultKind ?? null,
    p_error: params.error ?? null,
  });
  if (error) throw new Error(`finish_whatsapp_inbound_raw_capture falhou: ${error.message}`);
  return data === true;
}
