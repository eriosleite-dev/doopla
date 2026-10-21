import type { SupabaseClient } from '@supabase/supabase-js';

import { jaccardWordSimilarity } from './text-similarity';

// ADR 0009 (20/10/2026) — Mecanismo C do incidente P0 (ADR 0008):
// rede de segurança adicional, nunca a correção da causa raiz (essa é
// o Mecanismo A/B, já implementados). Detecta quando a resposta que
// está pra ser enviada é quase-idêntica às últimas N respostas de IA
// JÁ PERSISTIDAS (conversation_messages, author_type='ai') nesta mesma
// conversation — nunca o histórico completo, nunca de outra
// conversation.
//
// Deliberadamente simples (query direta numa tabela já existente,
// nunca um join com professional_self_whatsapp_sends/ADR 0009
// Mecanismo D): o padrão que este mecanismo detecta é o Planner
// gerando respostas repetidas pra uma pergunta travada, que aparece em
// conversation_messages independente do envio físico ter tido sucesso
// ou não.
//
// Limiar deliberadamente conservador (3 repetições consecutivas, 85%
// de similaridade) — nunca bloqueia uma resposta parecida UMA vez (ex.:
// a profissional perguntou a mesma coisa de dois jeitos diferentes),
// só um padrão repetitivo real. Menos de 3 mensagens anteriores =
// nunca suprime (dado insuficiente, fail-open: a prioridade aqui é
// nunca travar uma conversa legítima por engano).

const LOOP_DETECTION_WINDOW = 3;
const LOOP_DETECTION_SIMILARITY_THRESHOLD = 0.85;

export async function isReplyLoopDetected(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; aiMessageId: string; body: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('body')
    .eq('conversation_id', params.conversationId)
    .eq('author_type', 'ai')
    .neq('id', params.aiMessageId)
    .order('created_at', { ascending: false })
    .limit(LOOP_DETECTION_WINDOW);
  if (error) throw new Error(`isReplyLoopDetected falhou: ${error.message}`);

  const rows = (data ?? []) as Array<{ body: string | null }>;
  if (rows.length < LOOP_DETECTION_WINDOW) return false;

  return rows.every((row) => {
    if (!row.body) return false;
    return jaccardWordSimilarity(params.body, row.body) >= LOOP_DETECTION_SIMILARITY_THRESHOLD;
  });
}
