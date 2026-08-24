import type { ConversationMessage } from '@/lib/supabase/types';
import type { ContextSource, ToolContext } from '../types';
import { CONTEXT_MAX_MESSAGE_TEXT_CHARS, CONTEXT_MAX_MESSAGES, CONTEXT_MESSAGE_WINDOW_DAYS, truncateText } from './budget';
import type { MessageContextItem, MessagesSection } from './types';

// Doopla Intelligence Core v1 — Context Builder v1: seção de
// mensagens. Não é uma tool do Tool Registry (não existe "get_messages"
// neste bloco) — é lida direto via o client injetado em
// ToolContext.supabase, mesmo client de todo o resto do run, nunca um
// novo criado aqui.

function resolveMessageItem(message: ConversationMessage): MessageContextItem {
  let text: string | null = null;
  let truncated = false;

  if (message.content_type === 'text' && message.body) {
    const t = truncateText(message.body, CONTEXT_MAX_MESSAGE_TEXT_CHARS);
    text = t.value;
    truncated = t.truncated;
  } else if (message.content_type === 'audio' && message.transcription_status === 'done' && message.transcript) {
    // audio_url NUNCA vira conteúdo — só o transcript, e só quando a
    // transcrição está de fato concluída. Áudio pendente/falho entra
    // na lista sem texto, de propósito (ausência normal, não erro).
    const t = truncateText(message.transcript, CONTEXT_MAX_MESSAGE_TEXT_CHARS);
    text = t.value;
    truncated = t.truncated;
  }
  // attachment: text permanece null nesta etapa — nenhuma
  // interpretação de arquivo antes da camada de materiais existir.

  return {
    messageId: message.id,
    createdAt: message.created_at,
    authorType: message.author_type,
    direction: message.direction,
    contentType: message.content_type,
    text,
    truncated,
    provenance: { sourceType: 'conversation_message', sourceId: message.id },
  };
}

export async function buildMessagesSection(
  toolCtx: ToolContext,
  gate: { allowedContextSources: ContextSource[] },
  now: Date
): Promise<MessagesSection> {
  if (!gate.allowedContextSources.includes('conversation_messages')) {
    return { status: 'not_allowed' };
  }

  const windowSince = new Date(now.getTime() - CONTEXT_MESSAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data } = await toolCtx.supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', toolCtx.conversation.id)
    .gte('created_at', windowSince.toISOString())
    .order('created_at', { ascending: false })
    .limit(CONTEXT_MAX_MESSAGES)
    .returns<ConversationMessage[]>();

  const rows = data ?? [];
  // mais antiga primeiro, pra leitura natural de thread.
  const items = [...rows].reverse().map(resolveMessageItem);

  return {
    status: 'loaded',
    items,
    windowMessageCount: items.length,
    windowSince: windowSince.toISOString(),
  };
}
