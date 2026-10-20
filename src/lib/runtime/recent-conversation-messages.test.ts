import { describe, expect, it, vi } from 'vitest';

import { fetchLastAiMessage, fetchRecentConversationMessages } from './recent-conversation-messages';

// ADR 0010 (20/10/2026) — wrapper fino sobre o histórico recente da
// conversa. Cobre só o contrato: filtros certos, ordem cronológica
// (mais antiga primeiro), exclusão da mensagem-gatilho quando pedida,
// erro real nunca engolido.

function fakeSupabase(rows: Array<{ author_type: string; body: string | null }>) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as never;
}

describe('fetchRecentConversationMessages', () => {
  it('devolve em ordem cronológica (mais antiga primeiro), invertendo o desc do banco', async () => {
    const supabase = fakeSupabase([
      { author_type: 'professional', body: 'mais nova' },
      { author_type: 'ai', body: 'mais antiga' },
    ]);

    const result = await fetchRecentConversationMessages(supabase, { conversationId: 'conv-1' });

    expect(result).toEqual([
      { authorType: 'ai', text: 'mais antiga' },
      { authorType: 'professional', text: 'mais nova' },
    ]);
  });

  it('exclui a mensagem-gatilho quando excludeMessageId é passado', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ order, neq }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await fetchRecentConversationMessages(supabase, { conversationId: 'conv-1', excludeMessageId: 'msg-trigger' });

    expect(neq).toHaveBeenCalledWith('id', 'msg-trigger');
  });

  it('sem excludeMessageId, nunca chama neq', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ order, neq }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await fetchRecentConversationMessages(supabase, { conversationId: 'conv-1' });

    expect(neq).not.toHaveBeenCalled();
  });

  it('nunca engole um erro real da query — propaga como exceção', async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await expect(fetchRecentConversationMessages(supabase, { conversationId: 'conv-1' })).rejects.toThrow('falha simulada');
  });

  it('nenhuma mensagem anterior -> array vazio, nunca lança', async () => {
    const supabase = fakeSupabase([]);
    expect(await fetchRecentConversationMessages(supabase, { conversationId: 'conv-1' })).toEqual([]);
  });
});

// ADR 0011 (20/10/2026) — Fase A.
describe('fetchLastAiMessage', () => {
  function fakeSupabaseSingle(row: { id: string; body: string | null } | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    return { from } as never;
  }

  it('devolve a última mensagem de IA encontrada', async () => {
    const supabase = fakeSupabaseSingle({ id: 'msg-ai-1', body: 'Já confirmei o show de sábado.' });
    expect(await fetchLastAiMessage(supabase, 'conv-1')).toEqual({ id: 'msg-ai-1', text: 'Já confirmei o show de sábado.' });
  });

  it('nenhuma mensagem de IA ainda -> null, nunca lança', async () => {
    const supabase = fakeSupabaseSingle(null);
    expect(await fetchLastAiMessage(supabase, 'conv-1')).toBeNull();
  });

  it('nunca engole um erro real da query — propaga como exceção', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eq2 = vi.fn(() => ({ order }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await expect(fetchLastAiMessage(supabase, 'conv-1')).rejects.toThrow('falha simulada');
  });
});
