import type { SupabaseClient } from '@supabase/supabase-js';

import { EMPTY_CONVERSATION_STATE_SNAPSHOT } from './types';
import type { ConversationStateSnapshot } from './types';

// Doopla Intelligence Core v1 — Conversation State Ledger: wrapper fino
// sobre conversation_state_ledger (migration 0128). Mesmo padrão de
// pending-followups-db.ts/professional-memories.ts: nenhuma lógica de
// negócio aqui, só ler/gravar o snapshot já calculado por
// advanceConversationStateSnapshot (puro, já testado). snapshot é jsonb
// opaco pro banco — nunca interpretado em SQL.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

type RawRow = { conversation_id: string; snapshot: ConversationStateSnapshot };

// Ausência de linha é um estado NORMAL (conversa sem turno real
// processado ainda por este mecanismo, ou criada antes da migration
// 0128) — nunca tratada como erro, sempre devolve o snapshot vazio.
// Erro real de consulta (rede/banco) também cai pro snapshot vazio,
// de propósito: o ledger é um ATALHO/otimização sobre fatos que já
// estão na janela de mensagens, nunca a única fonte — uma falha aqui
// nunca pode bloquear o turno inteiro (mesmo raciocínio de
// unavailable em context-builder, mas sem um status próprio porque
// esta seção não é commitment-authorizing).
export async function readConversationStateSnapshot(supabase: AnySupabaseClient, conversationId: string): Promise<ConversationStateSnapshot> {
  const { data, error } = await supabase.from('conversation_state_ledger').select('snapshot').eq('conversation_id', conversationId).maybeSingle();

  if (error || !data) return EMPTY_CONVERSATION_STATE_SNAPSHOT;
  return (data as RawRow).snapshot ?? EMPTY_CONVERSATION_STATE_SNAPSHOT;
}

export async function writeConversationStateSnapshot(supabase: AnySupabaseClient, conversationId: string, snapshot: ConversationStateSnapshot): Promise<void> {
  const { error } = await supabase.from('conversation_state_ledger').upsert({ conversation_id: conversationId, snapshot }, { onConflict: 'conversation_id' });

  // Nunca lança: o ledger é um atalho (ver comentário acima), uma
  // falha de escrita não pode derrubar o turno que já processou e
  // respondeu de verdade. Precisa de observability própria quando o
  // wiring for pra produção — nota no relatório final.
  if (error) {
    console.error('writeConversationStateSnapshot falhou', { conversationId, error: error.message });
  }
}
