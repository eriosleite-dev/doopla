import type { SupabaseClient } from '@supabase/supabase-js';

// ADR 0011 (20/10/2026) — Fase A do sistema de evolução contínua:
// wrapper fino sobre record_conversation_feedback (migration 0124).
// Único caminho de escrita de conversation_feedback — nunca decide
// nada por si só, quem decide (gravar ou não) é pipeline.ts a partir
// do recognizer isolado.

export type RecordConversationFeedbackResult = { id: string } | null;

export async function recordConversationFeedback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    conversationId: string;
    triggerMessageId: string;
    flaggedMessageId: string | null;
    signal: 'negative' | 'positive';
    comment: string | null;
    modelUsed: string;
  }
): Promise<RecordConversationFeedbackResult> {
  const { data, error } = await supabase
    .rpc('record_conversation_feedback', {
      p_conversation_id: params.conversationId,
      p_trigger_message_id: params.triggerMessageId,
      p_flagged_message_id: params.flaggedMessageId,
      p_signal: params.signal,
      p_comment: params.comment,
      p_model_used: params.modelUsed,
    })
    .single();
  if (error) throw new Error(`record_conversation_feedback falhou: ${error.message}`);
  if (!data) return null;
  return { id: (data as { id: string }).id };
}
