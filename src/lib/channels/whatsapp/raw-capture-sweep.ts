import type { SupabaseClient } from '@supabase/supabase-js';

import { computeRuntimeRetryBackoffSeconds } from '../../runtime/retry-backoff';
import { evaluateWhatsappInboundRoutingSafety, handleWhatsappInboundMessage } from './intake-orchestration';
import { normalizeWhatsappPhone } from './phone';
import {
  claimWhatsappInboundRawCaptureForProcessing,
  classifyWhatsappInboundResultForCapture,
  finishWhatsappInboundRawCapture,
  listWhatsappInboundRawCapturesForSweep,
  type WhatsappInboundRawCaptureRow,
} from './raw-captures';

// Doopla Intelligence Core v1 — Fase 2 (ADR 0002, seção 12): sweep de
// recuperação pra capturas (Fase 1, migration 0112) que nunca
// concluíram o processamento. Reaproveita 100% dos mecanismos já
// existentes — claim/lease de 0112, o algoritmo puro de roteamento
// (via evaluateWhatsappInboundRoutingSafety), e o backoff de
// runtime/retry-backoff.ts. O ÚNICO código novo aqui é a orquestração
// (seleção -> pré-checagem -> claim -> execução -> classificação).
//
// Estruturalmente, isto é a MESMA Passagem 2 do webhook (route.ts),
// só disparada por um worker em vez de uma requisição ao vivo —
// mesmo claim, mesma function de processamento
// (handleWhatsappInboundMessage), mesma classificação de desfecho
// (classifyWhatsappInboundResultForCapture).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Mesmo espírito de RUNTIME_PENDING_REPLY_MAX_ATTEMPTS (retry-backoff.ts)
// — teto físico de tentativas antes de uma captura em needs_attention
// virar terminal (nunca mais reclamada pelo sweep automaticamente).
export const RAW_CAPTURE_SWEEP_MAX_ATTEMPTS = 8;

const SWEEP_WORKER_ID = 'whatsapp:raw-capture-sweep';

export type SweepCaptureOutcome =
  | 'resumed_completed'
  | 'resumed_delegated'
  | 'resumed_failed'
  | 'ambiguous_blocked'
  | 'invalid_phone'
  | 'claim_missed'
  | 'backoff_not_due';

// pending/processing nunca têm backoff (nada falhou ainda, só não
// terminou) — só needs_attention espaça as tentativas, mesmo padrão
// de runtime_pending_replies.
function isBackoffDue(capture: WhatsappInboundRawCaptureRow, now: Date): boolean {
  if (capture.status !== 'needs_attention') return true;
  const dueAtMs = new Date(capture.updatedAt).getTime() + computeRuntimeRetryBackoffSeconds(capture.attemptCount) * 1000;
  return now.getTime() >= dueAtMs;
}

// Processa UMA captura elegível. Nunca chama handleWhatsappInboundMessage
// sem antes confirmar (a) que o backoff já venceu e (b) que a
// pré-checagem de roteamento (evaluateWhatsappInboundRoutingSafety)
// confirma identidade determinística — achado central da Fase 2 (ADR
// 0002, seção 12.1): esse é o único jeito comprovadamente seguro de
// retomar sem arriscar reenviar um prompt de desambiguação.
export async function sweepOneWhatsappInboundRawCapture(
  supabase: AnySupabaseClient,
  capture: WhatsappInboundRawCaptureRow,
  now: Date = new Date()
): Promise<SweepCaptureOutcome> {
  if (!isBackoffDue(capture, now)) return 'backoff_not_due';

  const fromPhone = capture.fromPhone;
  const body = capture.body;
  const normalizedPhone = fromPhone ? normalizeWhatsappPhone(fromPhone.startsWith('+') ? fromPhone : `+${fromPhone}`) : null;

  // Sem telefone ou corpo utilizável — nunca deveria acontecer (a
  // seleção SQL já exclui completed/delegated, os únicos status que
  // zeram esses campos), mas defesa em profundidade, nunca confia só
  // na seleção de um lado.
  if (!normalizedPhone || !fromPhone || !body) {
    const claim = await claimWhatsappInboundRawCaptureForProcessing(supabase, { providerMessageId: capture.providerMessageId, workerId: SWEEP_WORKER_ID });
    if (!claim.claimed) return 'claim_missed';
    await finishWhatsappInboundRawCapture(supabase, {
      providerMessageId: capture.providerMessageId,
      workerId: SWEEP_WORKER_ID,
      status: 'needs_attention',
      resultKind: 'invalid_phone',
      error: 'telefone ou corpo ausente no momento do sweep',
    });
    return 'invalid_phone';
  }

  const safety = await evaluateWhatsappInboundRoutingSafety(supabase, normalizedPhone, body);
  if (!safety.safe) {
    const claim = await claimWhatsappInboundRawCaptureForProcessing(supabase, { providerMessageId: capture.providerMessageId, workerId: SWEEP_WORKER_ID });
    if (!claim.claimed) return 'claim_missed';
    await finishWhatsappInboundRawCapture(supabase, {
      providerMessageId: capture.providerMessageId,
      workerId: SWEEP_WORKER_ID,
      status: 'needs_attention',
      resultKind: 'ambiguous_retry_blocked',
      error: `identidade não resolve de forma determinística (${safety.reason}) — retomada automática bloqueada até sendSystemWhatsappMessage ter idempotência própria (pré-requisito da Fase 3)`,
    });
    return 'ambiguous_blocked';
  }

  const claim = await claimWhatsappInboundRawCaptureForProcessing(supabase, { providerMessageId: capture.providerMessageId, workerId: SWEEP_WORKER_ID });
  if (!claim.claimed) return 'claim_missed';

  try {
    const result = await handleWhatsappInboundMessage(supabase, normalizedPhone, {
      providerMessageId: capture.providerMessageId,
      from: fromPhone,
      body,
      contactName: capture.contactName,
      providerTimestampSeconds: capture.providerTimestampSeconds,
    });
    const { status, error } = classifyWhatsappInboundResultForCapture(result);
    await finishWhatsappInboundRawCapture(supabase, { providerMessageId: capture.providerMessageId, workerId: SWEEP_WORKER_ID, status, resultKind: result.kind, error });
    if (status === 'completed') return 'resumed_completed';
    if (status === 'delegated') return 'resumed_delegated';
    return 'resumed_failed';
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'erro desconhecido';
    await finishWhatsappInboundRawCapture(supabase, { providerMessageId: capture.providerMessageId, workerId: SWEEP_WORKER_ID, status: 'needs_attention', error: errorMessage });
    return 'resumed_failed';
  }
}

export type WhatsappInboundRawCaptureSweepTally = Record<SweepCaptureOutcome, number>;

// Entry point do cron (api/runtime/sweep-whatsapp-inbound-raw-captures).
// Sequencial, nunca paralelo — cada captura já é protegida por claim
// individual, mas processar uma de cada vez evita pressão
// desnecessária no Runtime (mesmo princípio do drain de
// professional_self_pending_messages).
export async function runWhatsappInboundRawCaptureSweep(
  supabase: AnySupabaseClient,
  params: { limit?: number; maxAttempts?: number } = {}
): Promise<WhatsappInboundRawCaptureSweepTally> {
  const maxAttempts = params.maxAttempts ?? RAW_CAPTURE_SWEEP_MAX_ATTEMPTS;
  const captures = await listWhatsappInboundRawCapturesForSweep(supabase, { maxAttempts, limit: params.limit ?? 50 });

  const tally: WhatsappInboundRawCaptureSweepTally = {
    resumed_completed: 0,
    resumed_delegated: 0,
    resumed_failed: 0,
    ambiguous_blocked: 0,
    invalid_phone: 0,
    claim_missed: 0,
    backoff_not_due: 0,
  };

  for (const capture of captures) {
    try {
      const outcome = await sweepOneWhatsappInboundRawCapture(supabase, capture);
      tally[outcome] += 1;
    } catch (err) {
      console.error('whatsapp raw-capture sweep: falha inesperada processando', capture.providerMessageId, err);
    }
  }

  return tally;
}
