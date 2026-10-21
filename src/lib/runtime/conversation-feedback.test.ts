import { describe, expect, it, vi } from 'vitest';

import { recordConversationFeedback } from './conversation-feedback';

// ADR 0011 (20/10/2026) — Fase A. Wrapper fino sobre o RPC.

describe('recordConversationFeedback', () => {
  it('chama o RPC com os parâmetros certos e devolve o id criado', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'fb-1' }, error: null });
    const rpc = vi.fn(() => ({ single }));
    const supabase = { rpc } as never;

    const result = await recordConversationFeedback(supabase, {
      conversationId: 'conv-1',
      triggerMessageId: 'msg-1',
      flaggedMessageId: 'msg-ai-1',
      signal: 'negative',
      comment: 'Erro, não era isso que perguntei',
      modelUsed: 'gpt-5-mini',
    });

    expect(rpc).toHaveBeenCalledWith('record_conversation_feedback', {
      p_conversation_id: 'conv-1',
      p_trigger_message_id: 'msg-1',
      p_flagged_message_id: 'msg-ai-1',
      p_signal: 'negative',
      p_comment: 'Erro, não era isso que perguntei',
      p_model_used: 'gpt-5-mini',
    });
    expect(result).toEqual({ id: 'fb-1' });
  });

  it('nunca engole um erro real do RPC — propaga como exceção', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const rpc = vi.fn(() => ({ single }));
    const supabase = { rpc } as never;

    await expect(
      recordConversationFeedback(supabase, {
        conversationId: 'conv-1',
        triggerMessageId: 'msg-1',
        flaggedMessageId: null,
        signal: 'positive',
        comment: null,
        modelUsed: 'gpt-5-mini',
      })
    ).rejects.toThrow('falha simulada');
  });
});
