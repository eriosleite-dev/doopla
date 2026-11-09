import type { SupabaseClient } from '@supabase/supabase-js';

import { triggerInboundMessage } from '@/lib/beta-integration/trigger';

// Doopla Intelligence Core v1 — Runtime: fila persistida e exclusiva
// de professional_self (P0 14/10/2026, revisão 2). Substitui a
// retentativa inline por tempo (migration 0107) por persistência ANTES
// de qualquer tentativa de ciclo (migration 0108) — ver comentário no
// topo da migration pro porquê.
//
// Nunca chamado por external_inquiry — zero mudança de comportamento
// pra esse caminho. Nunca toca Classifier/Planner/Approval Engine:
// este módulo só decide SE/QUANDO chamar triggerInboundMessage de
// novo, nunca o que ele faz por dentro.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type ProfessionalSelfPendingMessageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ProfessionalSelfPendingMessageRow = {
  id: string;
  representedProfessionalId: string;
  conversationId: string;
  providerMessageId: string;
  body: string | null;
  status: ProfessionalSelfPendingMessageStatus;
  attemptCount: number;
  maxAttempts: number;
  conversationMessageId: string | null;
  error: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(raw: any): ProfessionalSelfPendingMessageRow {
  return {
    id: raw.id,
    representedProfessionalId: raw.represented_professional_id,
    conversationId: raw.conversation_id,
    providerMessageId: raw.provider_message_id,
    body: raw.body,
    status: raw.status,
    attemptCount: raw.attempt_count,
    maxAttempts: raw.max_attempts,
    conversationMessageId: raw.conversation_message_id,
    error: raw.error,
  };
}

export async function enqueueProfessionalSelfPendingMessage(
  supabase: AnySupabaseClient,
  params: { professionalId: string; conversationId: string; providerMessageId: string; body: string; providerTimestamp: Date | null }
): Promise<ProfessionalSelfPendingMessageRow> {
  const { data, error } = await supabase
    .rpc('enqueue_professional_self_pending_message', {
      p_professional_id: params.professionalId,
      p_conversation_id: params.conversationId,
      p_provider_message_id: params.providerMessageId,
      p_body: params.body,
      p_provider_timestamp: params.providerTimestamp ? params.providerTimestamp.toISOString() : null,
    })
    .single();
  if (error || !data) throw new Error(`enqueue_professional_self_pending_message falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data);
}

async function claimNext(supabase: AnySupabaseClient, professionalId: string): Promise<ProfessionalSelfPendingMessageRow | null> {
  // setof (migration 0108) — maybeSingle é o idioma certo pra "zero ou
  // uma linha" (fila vazia é um resultado normal, nunca um erro).
  const { data, error } = await supabase.rpc('claim_next_professional_self_pending_message', { p_professional_id: professionalId }).maybeSingle();
  if (error) throw new Error(`claim_next_professional_self_pending_message falhou: ${error.message}`);
  if (!data) return null;
  return mapRow(data);
}

async function finish(
  supabase: AnySupabaseClient,
  params: { id: string; status: 'completed' | 'pending' | 'failed'; conversationMessageId?: string | null; error?: string | null; nextAttemptSeconds?: number | null }
): Promise<void> {
  const { error } = await supabase.rpc('finish_professional_self_pending_message', {
    p_id: params.id,
    p_status: params.status,
    p_conversation_message_id: params.conversationMessageId ?? null,
    p_error: params.error ?? null,
    p_next_attempt_seconds: params.nextAttemptSeconds ?? null,
  });
  if (error) throw new Error(`finish_professional_self_pending_message falhou: ${error.message}`);
}

async function acquireDrainLease(supabase: AnySupabaseClient, params: { professionalId: string; workerId: string }): Promise<string | null> {
  const { data, error } = await supabase
    .rpc('acquire_professional_self_drain_lease', { p_professional_id: params.professionalId, p_worker_id: params.workerId })
    .single();
  if (error || !data) throw new Error(`acquire_professional_self_drain_lease falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { granted: boolean; lease_token: string | null };
  return row.granted ? row.lease_token : null;
}

async function releaseDrainLease(supabase: AnySupabaseClient, params: { professionalId: string; leaseToken: string }): Promise<void> {
  const { error } = await supabase.rpc('release_professional_self_drain_lease', {
    p_professional_id: params.professionalId,
    p_lease_token: params.leaseToken,
  });
  if (error) throw new Error(`release_professional_self_drain_lease falhou: ${error.message}`);
}

export async function listProfessionalSelfPendingProfessionals(supabase: AnySupabaseClient, params: { limit?: number }): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_professional_self_pending_professionals', { p_limit: params.limit ?? 50 });
  if (error) throw new Error(`list_professional_self_pending_professionals falhou: ${error.message}`);
  return ((data ?? []) as Array<{ represented_professional_id: string }>).map((r) => r.represented_professional_id);
}

export async function purgeExpiredProfessionalSelfPendingMessageBodies(supabase: AnySupabaseClient, params: { olderThanDays?: number } = {}): Promise<number> {
  const { data, error } = await supabase.rpc('purge_expired_professional_self_pending_message_bodies', { p_older_than_days: params.olderThanDays ?? 7 });
  if (error) throw new Error(`purge_expired_professional_self_pending_message_bodies falhou: ${error.message}`);
  return (data as number) ?? 0;
}

export async function getProfessionalSelfPendingMessageStatus(
  supabase: AnySupabaseClient,
  params: { id: string }
): Promise<ProfessionalSelfPendingMessageStatus | null> {
  const { data } = await supabase.from('professional_self_pending_messages').select('status').eq('id', params.id).maybeSingle<{ status: ProfessionalSelfPendingMessageStatus }>();
  return data?.status ?? null;
}

// Backoff entre tentativas de uma falha REAL (nunca aplicado a
// conversation_busy/duplicate-em-voo — ver drainProfessionalSelfPendingMessages).
// Linear simples e capado — o cron já tem cadência própria de 1min,
// este backoff só evita que mensagens rápidas do profissional (cada
// uma disparando um novo drain inline) esgotem as 5 tentativas de uma
// linha travada em poucos segundos.
const FAILURE_BACKOFF_STEP_SECONDS = 30;
const FAILURE_BACKOFF_MAX_SECONDS = 300;
function computeFailureBackoffSeconds(attemptCount: number): number {
  return Math.min(FAILURE_BACKOFF_STEP_SECONDS * attemptCount, FAILURE_BACKOFF_MAX_SECONDS);
}

// Checagem adversarial (item C, aprovação 14/10/2026): duplicate_event
// NUNCA é sucesso por si só — alguém mais já reivindicou este
// provider_event_id em inbound_events, mas isso pode significar três
// coisas bem diferentes (ver comentário em cada ramo abaixo). Lê
// diretamente a fonte de verdade (inbound_events, migration 0051),
// nunca confia só no outcome.kind.
async function reconcileDuplicateEvent(
  supabase: AnySupabaseClient,
  row: ProfessionalSelfPendingMessageRow
): Promise<{ action: 'completed'; conversationMessageId: string | null } | { action: 'busy' } | { action: 'retry' } | { action: 'anomaly' }> {
  const { data } = await supabase
    .from('inbound_events')
    .select('processing_status, conversation_message_id, lease_expires_at')
    .eq('channel', 'whatsapp')
    .eq('provider_event_id', row.providerMessageId)
    .maybeSingle<{ processing_status: string; conversation_message_id: string | null; lease_expires_at: string }>();

  if (!data) {
    // Nunca deveria faltar (duplicate_event implica que claim_inbound_event
    // achou uma linha) — tratado como falha transitória comum, nunca
    // como sucesso.
    return { action: 'retry' };
  }

  if (data.processing_status === 'processed') {
    // conversation_message_id ausente aqui seria uma anomalia real
    // (finish_inbound_event sempre grava isso no caminho de sucesso,
    // pipeline.ts) — nunca assumido como sucesso silencioso.
    if (!data.conversation_message_id) return { action: 'anomaly' };
    return { action: 'completed', conversationMessageId: data.conversation_message_id };
  }

  if (data.processing_status === 'failed') {
    // O ciclo original realmente falhou (não é concorrência) — trata
    // como uma falha comum, elegível pro mesmo backoff/teto de
    // tentativas de qualquer outro erro.
    return { action: 'retry' };
  }

  // 'claimed' com lease ainda válida — outro processo está executando
  // este evento agora mesmo. Nunca reprocessa em paralelo.
  if (new Date(data.lease_expires_at).getTime() > Date.now()) {
    return { action: 'busy' };
  }
  return { action: 'retry' };
}

export type DrainStoppedReason = 'empty' | 'lease_not_granted' | 'busy' | 'retry_pending' | 'iteration_limit';

export type DrainResult = {
  stoppedReason: DrainStoppedReason;
  completedRowIds: string[];
  // Preenchido só quando watchRowId foi passado — status real da linha
  // específica depois deste drain (nunca assumido 'completed' sem
  // checar).
  watchedStatus: ProfessionalSelfPendingMessageStatus | null;
};

// Máximo de linhas drenadas numa única chamada — válvula de segurança
// simples (nunca um laço sem teto), não uma política de produto.
// Sobra fica pro próximo drain (inline da próxima mensagem, ou o
// próximo tick do cron).
const MAX_ROWS_PER_DRAIN_CALL = 20;

// Único ponto que decide SE uma nova tentativa de ciclo roda pra uma
// mensagem professional_self. Serializado por profissional
// (professional_self_drain_leases) — nunca duas chamadas concorrentes
// (inline + cron, ou dois ticks de cron sobrepostos) avançam ao mesmo
// tempo pra linhas diferentes do mesmo profissional. Dentro do laço,
// SEMPRE a linha mais antiga elegível primeiro; qualquer desfecho que
// não seja sucesso real ou falha terminal INTERROMPE o laço (nunca
// pula uma linha bloqueada pra tentar uma mais nova).
export async function drainProfessionalSelfPendingMessages(
  supabase: AnySupabaseClient,
  params: { professionalId: string; workerId: string; watchRowId?: string }
): Promise<DrainResult> {
  const leaseToken = await acquireDrainLease(supabase, { professionalId: params.professionalId, workerId: params.workerId });
  if (!leaseToken) {
    // Outro drain (inline ou cron) já está processando este profissional
    // agora — nunca uma segunda corrida pras mesmas linhas.
    return { stoppedReason: 'lease_not_granted', completedRowIds: [], watchedStatus: params.watchRowId ? await getProfessionalSelfPendingMessageStatus(supabase, { id: params.watchRowId }) : null };
  }

  const completedRowIds: string[] = [];
  let stoppedReason: DrainStoppedReason = 'empty';

  try {
    for (let i = 0; i < MAX_ROWS_PER_DRAIN_CALL; i++) {
      const row = await claimNext(supabase, params.professionalId);
      if (!row) {
        stoppedReason = 'empty';
        break;
      }

      let outcome;
      try {
        outcome = await triggerInboundMessage({
          conversationId: row.conversationId,
          authorType: 'professional',
          authorProfileId: row.representedProfessionalId,
          body: row.body ?? '',
          channel: 'whatsapp',
          providerEventId: row.providerMessageId,
          providerMessageId: row.providerMessageId,
          workerId: params.workerId,
        });
      } catch (err) {
        // Exceção real (nunca um outcome esperado) — mesmo tratamento
        // de uma falha comum, nunca derruba o drain inteiro.
        outcome = { kind: 'failed' as const, error: err instanceof Error ? err.message : 'unknown_error' };
      }

      if (outcome.kind === 'completed' || outcome.kind === 'cold_outreach_template') {
        await finish(supabase, { id: row.id, status: 'completed', conversationMessageId: outcome.conversationMessageId });
        completedRowIds.push(row.id);
        continue;
      }

      if (outcome.kind === 'duplicate_event') {
        const reconciled = await reconcileDuplicateEvent(supabase, row);
        if (reconciled.action === 'completed') {
          await finish(supabase, { id: row.id, status: 'completed', conversationMessageId: reconciled.conversationMessageId });
          completedRowIds.push(row.id);
          continue;
        }
        if (reconciled.action === 'busy') {
          await finish(supabase, { id: row.id, status: 'pending' });
          stoppedReason = 'busy';
          break;
        }
        if (reconciled.action === 'anomaly') {
          console.error('[professional-self-pending-messages] evento marcado processed sem conversation_message_id', { pendingMessageId: row.id, providerMessageId: row.providerMessageId });
          await finish(supabase, { id: row.id, status: 'failed', error: 'processed_without_message_id' });
          continue;
        }
        // 'retry' cai no mesmo tratamento de falha comum abaixo.
        outcome = { kind: 'failed' as const, error: 'duplicate_event_original_failed_or_missing' };
      }

      if (outcome.kind === 'conversation_busy') {
        await finish(supabase, { id: row.id, status: 'pending' });
        stoppedReason = 'busy';
        break;
      }

      // author_mismatch | conversation_not_found | failed — falha real.
      const reason = outcome.kind === 'failed' ? outcome.error : outcome.kind;
      if (row.attemptCount >= row.maxAttempts) {
        console.error('[professional-self-pending-messages] mensagem falhou permanentemente, tentativas esgotadas', {
          pendingMessageId: row.id,
          providerMessageId: row.providerMessageId,
          professionalId: row.representedProfessionalId,
          attemptCount: row.attemptCount,
          reason,
        });
        await finish(supabase, { id: row.id, status: 'failed', error: reason });
        continue;
      }
      await finish(supabase, { id: row.id, status: 'pending', error: reason, nextAttemptSeconds: computeFailureBackoffSeconds(row.attemptCount) });
      stoppedReason = 'retry_pending';
      break;
    }
  } finally {
    await releaseDrainLease(supabase, { professionalId: params.professionalId, leaseToken });
  }

  const watchedStatus = params.watchRowId ? await getProfessionalSelfPendingMessageStatus(supabase, { id: params.watchRowId }) : null;
  return { stoppedReason, completedRowIds, watchedStatus };
}
