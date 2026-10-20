import type { SupabaseClient } from '@supabase/supabase-js';

// ADR 0009 (20/10/2026) — Mecanismo A do incidente P0 (ADR 0008):
// atualidade antes de enviar pelo WhatsApp real. Pergunta única:
// triggerMessageId ainda é a mensagem INBOUND mais recente da
// profissional nesta conversation? Se não, a resposta que o Planner
// gerou pra ela já está obsoleta — a profissional já escreveu algo
// mais novo enquanto o ciclo rodava.

export async function isLatestInboundProfessionalMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; triggerMessageId: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id')
    .eq('conversation_id', params.conversationId)
    .eq('direction', 'inbound')
    .eq('author_type', 'professional')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`isLatestInboundProfessionalMessage falhou: ${error.message}`);
  // Nenhuma mensagem inbound encontrada seria uma anomalia (o próprio
  // triggerMessageId deveria existir) — tratado como "não é a mais
  // recente" (fail-closed: nunca envia sob incerteza).
  if (!data) return false;
  return data.id === params.triggerMessageId;
}
