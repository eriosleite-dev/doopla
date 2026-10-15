import type { SupabaseClient } from '@supabase/supabase-js';

import type { WhatsappInboundHandlerResult } from './intake-orchestration';

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

// Classificação de desfecho — ÚNICA implementação, reaproveitada tanto
// pela Passagem 2 do webhook (route.ts) quanto pelo sweep de
// recuperação (Fase 2) — nunca duas tabelas de decisão que possam
// divergir (achado real: estava duplicada em route.ts até a Fase 2,
// consolidada aqui). Evidência durável verificada por resultado,
// nunca otimista — ver também finish_whatsapp_inbound_raw_capture
// (0112). Dois grupos, NUNCA tratados como o mesmo caso (achado da
// revisão do Head of AI, 15/10/2026, antes de ir pra staging):
//
//   COMPLETED — conteúdo numa posição durável e ESTÁVEL, nada mais em
//   voo pro conteúdo em si (mesmo que a CONVERSA siga aberta):
//     routed       -> conversation_messages gravado (persist_inbound_message, idempotente por wamid desde 0111).
//     duplicate_event -> o claim de concorrência (claimWhatsappInboundRawCaptureForProcessing) já
//                        serializa qualquer concorrência real pro MESMO wamid — nenhum dos dois call
//                        sites de claim_inbound_event pra wamid de cliente (claimRawInboundEvent em
//                        intake-orchestration.ts, e o claim tardio da Pipeline pro ramo de identidade
//                        verificada, via claimInboundEvent em runtime/inbound-events.ts) pode rodar
//                        duas vezes em paralelo pro mesmo wamid, porque os dois só são alcançados DE
//                        DENTRO de handleWhatsappInboundMessage, sempre atrás dessa claim. Logo
//                        claimed=false aqui só pode significar already_processed=true.
//     backlogged/abandoned -> conteúdo já durável em channel_inbound_intake_messages
//                        (append_channel_inbound_intake_message RODA ANTES de qualquer um dos dois
//                        serem retornados, intake-orchestration.ts) — a MENSAGEM terminou sua jornada
//                        aqui, mesmo que a sessão de intake continue aguardando o cliente.
//
//   DELEGATED — conteúdo já durável, mas a responsabilidade pelo que
//   falta é de OUTRO mecanismo, que AINDA está com uma tentativa ativa
//   em andamento (não alcançou nem o próprio estado terminal):
//     deferred -> conteúdo em professional_self_pending_messages, gravado ANTES de qualquer
//                 tentativa de ciclo (migration 0108) — nunca se perde mesmo que o drain falhe — mas
//                 resolveProfessionalSelfAndFinish só devolve 'deferred' quando
//                 drainResult.watchedStatus AINDA NÃO é 'completed' (pending/processing de verdade) —
//                 marcar isso 'completed' esconderia que uma tentativa real segue em andamento.
//
// invalid_phone/demais `kind`s não reconhecidos nunca são sucesso
// durável em lugar nenhum além desta própria captura — ficam
// needs_attention de propósito, nunca reinterpretados como sucesso.
export function classifyWhatsappInboundResultForCapture(result: WhatsappInboundHandlerResult): { status: 'completed' | 'delegated' | 'needs_attention'; error: string | null } {
  if (result.kind === 'routed' || result.kind === 'duplicate_event' || result.kind === 'backlogged' || result.kind === 'abandoned') {
    return { status: 'completed', error: null };
  }
  if (result.kind === 'deferred') {
    return { status: 'delegated', error: null };
  }
  return { status: 'needs_attention', error: `resultado não reconhecido como sucesso durável: ${result.kind}` };
}

export type WhatsappInboundRawCaptureRow = {
  id: string;
  providerMessageId: string;
  fromPhone: string | null;
  body: string | null;
  contactName: string | null;
  providerTimestampSeconds: number | null;
  status: string;
  resultKind: string | null;
  attemptCount: number;
  capturedAt: string;
  updatedAt: string;
};

// Fase 2 (ADR 0002, seção 12) — leitura pro sweep de recuperação.
// Seleção grosseira em SQL (status elegível + teto de tentativas,
// migration 0113); o backoff fino (computeRuntimeRetryBackoffSeconds,
// reaproveitado de runtime/retry-backoff.ts, nunca uma segunda
// implementação) é aplicado do lado de cá, em runWhatsappInboundRawCaptureSweep.
export async function listWhatsappInboundRawCapturesForSweep(
  supabase: AnySupabaseClient,
  params: { maxAttempts: number; limit?: number }
): Promise<WhatsappInboundRawCaptureRow[]> {
  const { data, error } = await supabase.rpc('list_whatsapp_inbound_raw_captures_for_sweep', {
    p_max_attempts: params.maxAttempts,
    p_limit: params.limit ?? 50,
  });
  if (error) throw new Error(`list_whatsapp_inbound_raw_captures_for_sweep falhou: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      provider_message_id: string;
      from_phone: string | null;
      body: string | null;
      contact_name: string | null;
      provider_timestamp_seconds: number | null;
      status: string;
      result_kind: string | null;
      attempt_count: number;
      captured_at: string;
      updated_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    providerMessageId: r.provider_message_id,
    fromPhone: r.from_phone,
    body: r.body,
    contactName: r.contact_name,
    providerTimestampSeconds: r.provider_timestamp_seconds,
    status: r.status,
    resultKind: r.result_kind,
    attemptCount: r.attempt_count,
    capturedAt: r.captured_at,
    updatedAt: r.updated_at,
  }));
}
