import { describe, expect, it, vi } from 'vitest';

import { isReplyLoopDetected } from './reply-loop-detection';

// ADR 0009 (20/10/2026) — Mecanismo C do incidente P0 (ADR 0008).
// Cobre só o contrato do wrapper: fail-open sob dado insuficiente,
// detecção real quando as últimas 3 são muito parecidas, erro real
// nunca engolido.

function fakeSupabase(rows: Array<{ body: string | null }>) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn(() => ({ limit }));
  const neq = vi.fn(() => ({ order }));
  const eq2 = vi.fn(() => ({ neq }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { from } as never;
}

describe('isReplyLoopDetected', () => {
  it('fail-open: menos de 3 mensagens anteriores -> nunca detecta loop', async () => {
    const supabase = fakeSupabase([{ body: 'oi, posso ajudar?' }]);

    expect(await isReplyLoopDetected(supabase, { conversationId: 'conv-1', aiMessageId: 'ai-current', body: 'oi, posso ajudar?' })).toBe(false);
  });

  it('detecta loop quando as últimas 3 respostas são quase-idênticas à nova', async () => {
    const supabase = fakeSupabase([
      { body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.' },
      { body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.' },
      { body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.' },
    ]);

    expect(
      await isReplyLoopDetected(supabase, {
        conversationId: 'conv-1',
        aiMessageId: 'ai-current',
        body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.',
      })
    ).toBe(true);
  });

  it('NUNCA detecta loop quando as respostas são parecidas mas não as 3 ao mesmo tempo (uma delas diverge)', async () => {
    const supabase = fakeSupabase([
      { body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.' },
      { body: 'Qual é a data do seu evento?' },
      { body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.' },
    ]);

    expect(
      await isReplyLoopDetected(supabase, {
        conversationId: 'conv-1',
        aiMessageId: 'ai-current',
        body: 'Deixa eu confirmar os detalhes do seu evento, só um instante.',
      })
    ).toBe(false);
  });

  it('NUNCA bloqueia uma resposta parecida só uma vez (threshold de 3, nunca 1)', async () => {
    const supabase = fakeSupabase([
      { body: 'Oi! Em que posso ajudar hoje?' },
      { body: 'Combinado então, qualquer coisa me chama.' },
      { body: 'Perfeito, vou verificar isso.' },
    ]);

    expect(await isReplyLoopDetected(supabase, { conversationId: 'conv-1', aiMessageId: 'ai-current', body: 'Oi! Em que posso ajudar hoje?' })).toBe(
      false
    );
  });

  it('nunca engole um erro real da query — propaga como exceção', async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eq2 = vi.fn(() => ({ neq }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await expect(isReplyLoopDetected(supabase, { conversationId: 'conv-1', aiMessageId: 'ai-current', body: 'oi' })).rejects.toThrow('falha simulada');
  });
});
