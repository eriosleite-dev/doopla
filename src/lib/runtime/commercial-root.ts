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
