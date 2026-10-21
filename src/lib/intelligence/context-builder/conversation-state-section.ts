import { readConversationStateSnapshot } from '../conversation-state';
import type { ContextSource, ToolContext } from '../types';
import type { ConversationStateSection } from './types';

// Doopla Intelligence Core v1 — Context Builder v1: seção do
// Conversation State Ledger. Mesmo raciocínio de messages.ts: não é
// uma tool do Tool Registry — lida direto via o client injetado em
// ToolContext.supabase, sempre elegível junto de conversation_messages
// (ver policy-gate.ts), nunca dependente de opportunity/booking.

export async function buildConversationStateSection(
  toolCtx: ToolContext,
  gate: { allowedContextSources: ContextSource[] }
): Promise<ConversationStateSection> {
  if (!gate.allowedContextSources.includes('conversation_state')) {
    return { status: 'not_allowed' };
  }

  // readConversationStateSnapshot nunca lança (ver store.ts) — ausência
  // de linha ou erro de consulta caem pro snapshot vazio, nunca
  // 'unavailable' aqui: o ledger é um atalho sobre fatos que a janela
  // de mensagens já carrega, uma falha em lê-lo não pode se comportar
  // como "fonte autorizada que falhou" (diferente de opportunity/booking).
  const snapshot = await readConversationStateSnapshot(toolCtx.supabase, toolCtx.conversation.id);
  return { status: 'loaded', snapshot };
}
