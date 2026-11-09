import { describe, expect, it, vi } from 'vitest';

import { isLatestInboundProfessionalMessage } from './conversation-freshness';

// ADR 0009 (20/10/2026) — wrapper fino sobre a consulta de atualidade
// (Mecanismo A). Cobre só o contrato do wrapper: filtros certos,
// fail-closed quando não encontra nada, erro real nunca engolido.

function fakeSupabase(result: { data: { id: string } | null; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq3 = vi.fn(() => ({ order }));
  const eq2 = vi.fn(() => ({ eq: eq3 }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { from } as never;
}

describe('isLatestInboundProfessionalMessage', () => {
  it('true quando o triggerMessageId é a mensagem inbound mais recente', async () => {
    const supabase = fakeSupabase({ data: { id: 'msg-latest' }, error: null });

    const result = await isLatestInboundProfessionalMessage(supabase, { conversationId: 'conv-1', triggerMessageId: 'msg-latest' });

    expect(result).toBe(true);
  });

  it('false quando existe uma mensagem inbound mais nova que o triggerMessageId', async () => {
    const supabase = fakeSupabase({ data: { id: 'msg-newer' }, error: null });

    const result = await isLatestInboundProfessionalMessage(supabase, { conversationId: 'conv-1', triggerMessageId: 'msg-older' });

    expect(result).toBe(false);
  });

  it('fail-closed: nenhuma mensagem inbound encontrada (anomalia) -> false, nunca assume que está atualizada', async () => {
    const supabase = fakeSupabase({ data: null, error: null });

    const result = await isLatestInboundProfessionalMessage(supabase, { conversationId: 'conv-1', triggerMessageId: 'msg-1' });

    expect(result).toBe(false);
  });

  it('nunca engole um erro real da query — propaga como exceção', async () => {
    const supabase = fakeSupabase({ data: null, error: { message: 'falha simulada' } });

    await expect(isLatestInboundProfessionalMessage(supabase, { conversationId: 'conv-1', triggerMessageId: 'msg-1' })).rejects.toThrow(
      'falha simulada'
    );
  });
});
