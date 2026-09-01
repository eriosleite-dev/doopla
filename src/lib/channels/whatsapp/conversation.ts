// Doopla Intelligence Core v1 — canal WhatsApp (passo 6A): seleção da
// conversa certa pra um par (professional_id, external_participant_id)
// já resolvido. Compartilhado entre o outreach (Server Action,
// autenticado) e o webhook inbound (service_role) — a REGRA é a mesma
// dos dois lados, só o que fazer quando não acha uma conversa
// reaproveitável diverge (outreach cria; webhook nunca cria sozinho,
// ver comentário em route.ts).
//
// Regra operacional atual — documentada explicitamente porque
// conversations.current_state AINDA NÃO tem state machine própria
// (confirmado no código: advance_conversation_state, migration 0039,
// comentário literal "A State Machine completa ainda não existe").
// Sem terminal definido em current_state, a única autoridade real de
// "esse relacionamento comercial acabou" que já existe no sistema é o
// commercial root (is_commercial_root_terminal, já usado pelo
// Post-model Gate) — nunca inventamos um conceito de "conversa
// aberta" novo:
//   - conversa sem commercial root ainda -> reusa;
//   - commercial root NÃO terminal -> reusa;
//   - todas as conversas existentes com commercial root terminal ->
//     nenhuma reaproveitável (cabe ao chamador decidir o que fazer).
// Quando current_state ganhar uma state machine própria, esta regra
// precisa ser revisitada — não é definitiva, é a melhor âncora
// disponível hoje.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

export async function findReusableWhatsappConversation(
  supabase: AnySupabaseClient,
  params: { professionalId: string; externalParticipantId: string }
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, related_booking_id, related_opportunity_id')
    .eq('represented_professional_id', params.professionalId)
    .eq('external_participant_id', params.externalParticipantId)
    .order('created_at', { ascending: false });

  const rows = (existing ?? []) as Array<{ id: string; related_booking_id: string | null; related_opportunity_id: string | null }>;
  for (const conversation of rows) {
    if (!conversation.related_booking_id && !conversation.related_opportunity_id) {
      return conversation.id;
    }
    const { data: rootId } = await supabase.rpc('resolve_commercial_root_id', {
      p_booking_id: conversation.related_booking_id,
      p_opportunity_id: conversation.related_opportunity_id,
    });
    if (!rootId) continue;
    const { data: isTerminal } = await supabase.rpc('is_commercial_root_terminal', { p_commercial_root_id: rootId as string });
    if (isTerminal !== true) {
      return conversation.id;
    }
  }

  return null;
}
