import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: wrapper fino sobre
// ensure_opportunity_for_conversation (migration 0051). Chamado logo
// após o Intent Classifier (Bloco 3) — nunca usa commitmentNature
// (Bloco 4, decisão explícita do usuário: opportunity pode nascer
// antes de qualquer compromisso).

export async function ensureOpportunityForConversation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; primaryIntent: string; classificationStatus: string }
): Promise<{ opportunityId: string | null; created: boolean }> {
  const { data, error } = await supabase
    .rpc('ensure_opportunity_for_conversation', {
      p_conversation_id: params.conversationId,
      p_primary_intent: params.primaryIntent,
      p_classification_status: params.classificationStatus,
    })
    .single();
  if (error || !data) throw new Error(`ensure_opportunity_for_conversation falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { opportunity_id: string | null; created: boolean };
  return { opportunityId: row.opportunity_id, created: row.created };
}

// Deriva bookingId/opportunityId efetivos a partir do resultado de
// ensureOpportunityForConversation — 100% código, puro, testável
// isoladamente. A RPC devolve um id UNIFICADO (root reusado pode ser
// booking OU opportunity — coalesce estrutural, ver comentário da
// própria function na migration 0051); uma linha NOVA criada por ela
// é sempre opportunity (só insere ali). Nunca adivinha: compara contra
// o que a conversation já tinha ANTES da chamada.
export function resolveEffectiveCommercialRoot(
  linkResult: { opportunityId: string | null; created: boolean },
  conversationBefore: { relatedBookingId: string | null }
): { bookingId: string | null; opportunityId: string | null } {
  if (!linkResult.opportunityId) return { bookingId: null, opportunityId: null };
  if (linkResult.created) return { bookingId: null, opportunityId: linkResult.opportunityId };
  if (conversationBefore.relatedBookingId === linkResult.opportunityId) {
    return { bookingId: linkResult.opportunityId, opportunityId: null };
  }
  return { bookingId: null, opportunityId: linkResult.opportunityId };
}

// Retomada (fechar o ciclo de decisão do profissional): uma
// runtime_pending_reply guarda só commercial_root_id (o id
// UNIFICADO — nunca fk pra bookings/opportunities, mesmo padrão de
// approval_records/policy_gate_decisions). Pra reconstruir
// {bookingId, opportunityId} sem chamar ensureOpportunityForConversation
// de novo (a linking já aconteceu no ciclo original — chamar de novo
// arriscaria criar uma opportunity nova à toa), compara contra o
// estado ATUAL da conversation. Fail-closed por design (decisão do
// usuário implícita na disciplina de idempotência/ambiguidade do
// bloco): se a raiz não bate contra nem related_booking_id nem
// related_opportunity_id atuais (conversation desvinculada, ou uma
// opportunity virou booking com id diferente do esperado), a retomada
// NUNCA adivinha — devolve null, o chamador deixa a pendência como
// está pra uma tentativa futura.
export async function resolveCommercialRootForResumption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { commercialRootId: string; conversation: { relatedBookingId: string | null; relatedOpportunityId: string | null } }
): Promise<{ bookingId: string | null; opportunityId: string | null } | null> {
  if (params.conversation.relatedBookingId) {
    const { data } = await supabase.rpc('resolve_commercial_root_id', {
      p_booking_id: params.conversation.relatedBookingId,
      p_opportunity_id: null,
    });
    if (data === params.commercialRootId) return { bookingId: params.conversation.relatedBookingId, opportunityId: null };
  }
  if (params.conversation.relatedOpportunityId) {
    const { data } = await supabase.rpc('resolve_commercial_root_id', {
      p_booking_id: null,
      p_opportunity_id: params.conversation.relatedOpportunityId,
    });
    if (data === params.commercialRootId) return { bookingId: null, opportunityId: params.conversation.relatedOpportunityId };
  }
  return null;
}
