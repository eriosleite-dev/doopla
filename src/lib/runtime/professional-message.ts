import type { SupabaseClient } from '@supabase/supabase-js';

import { stripTravessao } from './message-style';

// Doopla Intelligence Core v1 — Runtime: wrapper fino sobre
// persist_ai_message (migration 0052). Único caminho de escrita da
// resposta da própria Doopla endereçada ao PROFISSIONAL —
// professional_self, ou consult_professional dentro de uma conversa
// external_inquiry (prompt.ts documenta que esse plano pode produzir
// um draft dirigido ao profissional, não ao cliente). Nunca usado pra
// cliente externo — isso é outbound.ts/createOutboundIntent.

export async function persistAiMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { conversationId: string; contentType: string; body: string }
): Promise<{ id: string }> {
  // P1 UX (14/10/2026) — único conteúdo que passa por aqui é da
  // própria Doopla (ver comentário no topo do arquivo), nunca texto
  // humano: sempre seguro sanitizar incondicionalmente.
  const { data, error } = await supabase
    .rpc('persist_ai_message', {
      p_conversation_id: params.conversationId,
      p_content_type: params.contentType,
      p_body: stripTravessao(params.body),
    })
    .single();
  if (error || !data) throw new Error(`persist_ai_message falhou: ${error?.message ?? 'sem dado'}`);
  return data as { id: string };
}
