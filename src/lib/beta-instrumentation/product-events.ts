import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProductEventCategory, ProductEventType, SubjectType } from './event-types';
import { isValidProductEventType } from './event-types';

// Doopla Intelligence Core v1 — Beta Instrumentation: escrita de
// product_events. Nunca lançável — falha aqui é telemetria, mesmo
// idioma de observability.ts/context-evidence.ts. Idempotente por
// (professionalId, idempotencyKey) — ver record_product_event,
// migration 0065.

export type RecordProductEventParams = {
  professionalId: string;
  category: ProductEventCategory;
  eventType: ProductEventType;
  occurredAt: Date;
  idempotencyKey: string;
  subjectType: SubjectType;
  subjectId: string;
  commercialRootId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  sourceMessageId?: string | null;
  actorType?: 'professional' | 'external_participant' | 'ai' | 'system' | null;
  payload?: Record<string, unknown>;
  source: 'runtime' | 'dashboard' | 'webhook' | 'cron';
};

export type RecordProductEventResult = { ok: true; id: string; inserted: boolean } | { ok: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordProductEvent(supabase: SupabaseClient<any>, params: RecordProductEventParams): Promise<RecordProductEventResult> {
  // Prova estrutural (sem depender do CHECK do banco pra pegar o erro
  // tarde): todo event_type gravado precisa estar no registry
  // canônico, mesmo sem CHECK constraint no banco.
  if (!isValidProductEventType(params.eventType)) {
    console.error(`recordProductEvent: event_type fora do registry canônico: ${params.eventType}`);
    return { ok: false };
  }

  const { data, error } = await supabase
    .rpc('record_product_event', {
      p_professional_id: params.professionalId,
      p_category: params.category,
      p_event_type: params.eventType,
      p_occurred_at: params.occurredAt.toISOString(),
      p_idempotency_key: params.idempotencyKey,
      p_subject_type: params.subjectType,
      p_subject_id: params.subjectId,
      p_commercial_root_id: params.commercialRootId ?? null,
      p_conversation_id: params.conversationId ?? null,
      p_run_id: params.runId ?? null,
      p_source_message_id: params.sourceMessageId ?? null,
      p_actor_type: params.actorType ?? null,
      p_payload: params.payload ?? {},
      p_source: params.source,
    })
    .single<{ id: string; inserted: boolean }>();

  if (error || !data) {
    console.error(`record_product_event falhou (telemetria — ciclo principal não é afetado): ${error?.message ?? 'sem dado'}`);
    return { ok: false };
  }
  return { ok: true, id: data.id, inserted: data.inserted };
}
