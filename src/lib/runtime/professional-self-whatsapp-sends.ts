import type { SupabaseClient } from '@supabase/supabase-js';

// ADR 0009 (20/10/2026) — Mecanismo D do incidente P0 (ADR 0008):
// idempotência real de envio pra professional_self. Wrapper fino sobre
// claim_professional_self_whatsapp_send (migration 0122) — nunca
// decide nada por si só, só expõe o RPC com tipos.

export async function claimProfessionalSelfWhatsappSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { aiMessageId: string }
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_professional_self_whatsapp_send', { p_ai_message_id: params.aiMessageId });
  if (error) throw new Error(`claim_professional_self_whatsapp_send falhou: ${error.message}`);
  return data === true;
}
