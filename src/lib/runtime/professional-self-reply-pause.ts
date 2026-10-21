import type { SupabaseClient } from '@supabase/supabase-js';

// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
// wrapper fino sobre conversations.professional_self_reply_paused_at
// (migration 0123). Nunca decide nada por si só — quem decide é
// pipeline.ts (ao processar o recognizer) e sendProfessionalSelfReplyViaWhatsapp
// (ao checar antes de enviar).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export async function isProfessionalSelfReplyPaused(supabase: AnySupabaseClient, conversationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('conversations')
    .select('professional_self_reply_paused_at')
    .eq('id', conversationId)
    .maybeSingle<{ professional_self_reply_paused_at: string | null }>();
  if (error) throw new Error(`isProfessionalSelfReplyPaused falhou: ${error.message}`);
  return data?.professional_self_reply_paused_at != null;
}

export async function setProfessionalSelfReplyPaused(supabase: AnySupabaseClient, params: { conversationId: string; paused: boolean }): Promise<void> {
  const { error } = await supabase.rpc('set_professional_self_reply_paused', { p_conversation_id: params.conversationId, p_paused: params.paused });
  if (error) throw new Error(`set_professional_self_reply_paused falhou: ${error.message}`);
}
