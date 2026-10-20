import type { SupabaseClient } from '@supabase/supabase-js';

// ADR 0010 (20/10/2026) — correção da causa raiz confirmada no
// incidente real "Gabi"/72h: o recognizer de delegação nunca recebia
// o histórico da conversa atual, só a mensagem isolada + um resumo de
// estado operacional antigo. Wrapper fino e deliberadamente simples —
// só author_type + body, nunca o ContextPackage inteiro (esse
// continua existindo só pro Classifier/Planner normais).
//
// Limitação conhecida, documentada: usa só `body` (texto), nunca
// `transcript` — uma mensagem de áudio recente apareceria aqui com
// text=null. Suficiente pro uso atual (um sinal de continuidade pro
// recognizer, nunca uma fonte de evidência citável), não resolve o
// caso de áudio — fora de escopo desta correção.
export type RecentConversationMessageItem = { authorType: string; text: string | null };

export async function fetchRecentConversationMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; excludeMessageId?: string | null; limit?: number }
): Promise<RecentConversationMessageItem[]> {
  let query = supabase.from('conversation_messages').select('author_type, body').eq('conversation_id', params.conversationId);
  if (params.excludeMessageId) {
    query = query.neq('id', params.excludeMessageId);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(params.limit ?? 3);
  if (error) throw new Error(`fetchRecentConversationMessages falhou: ${error.message}`);
  const rows = (data ?? []) as Array<{ author_type: string; body: string | null }>;
  // Devolve em ordem cronológica (mais antiga primeiro) — mesma
  // convenção já usada em PlannerMessageItem/MessageContextItem.
  return rows.reverse().map((r) => ({ authorType: r.author_type, text: r.body }));
}
