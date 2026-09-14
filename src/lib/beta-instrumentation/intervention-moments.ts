import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Beta Instrumentation: Intervention
// Moments. V1 = 'correction' | 'edit' | 'rejection' | 'undo' |
// 'takeover' — NUNCA 'approval' (aprovação/aceitação positiva é
// behavioral feedback derivável de approval_records/approval_resolutions,
// nunca duplicado aqui; e ausência de uma linha aqui NUNCA é lida como
// sinal positivo — ver comentário na migration 0065).
//
// probable_reason nasce sempre null aqui — nenhum model call síncrono
// neste bloco (decisão do usuário). setInterventionMomentReason existe
// pronta pra um job assíncrono futuro classificar em lote; nenhum
// caminho deste bloco a chama ainda.

export type InterventionType = 'correction' | 'edit' | 'rejection' | 'undo' | 'takeover';
export type InterventionReason =
  | 'price_or_condition_incorrect'
  | 'inadequate_tone'
  | 'lost_context'
  | 'unnecessary_approval'
  | 'missing_information'
  | 'wrong_interpretation'
  | 'personal_preference'
  | 'other';

export type RecordInterventionMomentParams = {
  professionalId: string;
  conversationId: string;
  runId: string;
  interventionType: InterventionType;
  commercialRootId?: string | null;
  bookingId?: string | null;
  outboundIntentId?: string | null;
  originalMessageId?: string | null;
  detectedMessageId?: string | null;
};

export type RecordInterventionMomentResult = { ok: true; id: string } | { ok: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordInterventionMoment(supabase: SupabaseClient<any>, params: RecordInterventionMomentParams): Promise<RecordInterventionMomentResult> {
  const { data, error } = await supabase
    .rpc('record_intervention_moment', {
      p_professional_id: params.professionalId,
      p_conversation_id: params.conversationId,
      p_run_id: params.runId,
      p_intervention_type: params.interventionType,
      p_commercial_root_id: params.commercialRootId ?? null,
      p_booking_id: params.bookingId ?? null,
      p_outbound_intent_id: params.outboundIntentId ?? null,
      p_original_message_id: params.originalMessageId ?? null,
      p_detected_message_id: params.detectedMessageId ?? null,
    })
    .single<{ id: string }>();

  if (error || !data) {
    console.error(`record_intervention_moment falhou (telemetria — ciclo principal não é afetado): ${error?.message ?? 'sem dado'}`);
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

export type SetInterventionMomentReasonParams = {
  interventionMomentId: string;
  professionalId: string;
  newReason: InterventionReason;
  classifiedBy: 'system' | 'professional' | 'admin';
  classifierVersion?: string | null;
  reasonForChange?: string | null;
};

// Não chamada por nenhum caminho síncrono deste bloco — pronta pra um
// job assíncrono/fluxo de correção futuro. Sempre grava em
// intervention_moment_reason_events (append-only) antes de atualizar o
// snapshot — nunca destrói histórico (ver migration 0065).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setInterventionMomentReason(supabase: SupabaseClient<any>, params: SetInterventionMomentReasonParams): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('set_intervention_moment_reason', {
    p_intervention_moment_id: params.interventionMomentId,
    p_professional_id: params.professionalId,
    p_new_reason: params.newReason,
    p_classified_by: params.classifiedBy,
    p_classifier_version: params.classifierVersion ?? null,
    p_reason_for_change: params.reasonForChange ?? null,
  });
  if (error) {
    console.error(`set_intervention_moment_reason falhou: ${error.message}`);
    return { ok: false };
  }
  return { ok: true };
}
