import { describe, expect, it } from 'vitest';

import { persistAiMessage } from './professional-message';

// P1 UX conversacional (14/10/2026) — persistAiMessage só recebe
// conteúdo da própria Doopla (nunca texto humano, ver comentário no
// topo de professional-message.ts), então sanitiza incondicionalmente.

function fakeSupabase(onRpc: (args: Record<string, unknown>) => void) {
  return {
    rpc(_fn: string, args: Record<string, unknown>) {
      onRpc(args);
      const result = { data: { id: 'ai-msg-1' }, error: null };
      return { single: async () => result };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('persistAiMessage', () => {
  it('sanitiza travessão do body antes de persistir', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = fakeSupabase((args) => {
      captured = args;
    });

    await persistAiMessage(supabase, { conversationId: 'conv-1', contentType: 'text', body: 'Obrigado — já te retorno com os detalhes.' });

    expect(captured!.p_body).toBe('Obrigado, já te retorno com os detalhes.');
  });
});
