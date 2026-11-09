import { describe, expect, it, vi } from 'vitest';

import { isProfessionalSelfReplyPaused, setProfessionalSelfReplyPaused } from './professional-self-reply-pause';

// ADR 0009 (20/10/2026) — wrapper fino sobre o estado de pausa
// (Mecanismo B). Cobre só o contrato do wrapper.

describe('isProfessionalSelfReplyPaused', () => {
  it('true quando professional_self_reply_paused_at não é null', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { professional_self_reply_paused_at: '2026-10-20T10:00:00Z' }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    expect(await isProfessionalSelfReplyPaused(supabase, 'conv-1')).toBe(true);
  });

  it('false quando professional_self_reply_paused_at é null', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { professional_self_reply_paused_at: null }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    expect(await isProfessionalSelfReplyPaused(supabase, 'conv-1')).toBe(false);
  });

  it('false quando a conversation não é encontrada (nunca lança sob ausência de dado)', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    expect(await isProfessionalSelfReplyPaused(supabase, 'conv-1')).toBe(false);
  });

  it('nunca engole um erro real da query — propaga como exceção', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    await expect(isProfessionalSelfReplyPaused(supabase, 'conv-1')).rejects.toThrow('falha simulada');
  });
});

describe('setProfessionalSelfReplyPaused', () => {
  it('chama o RPC com os parâmetros certos pra pausar', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;

    await setProfessionalSelfReplyPaused(supabase, { conversationId: 'conv-1', paused: true });

    expect(rpc).toHaveBeenCalledWith('set_professional_self_reply_paused', { p_conversation_id: 'conv-1', p_paused: true });
  });

  it('chama o RPC com os parâmetros certos pra retomar', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;

    await setProfessionalSelfReplyPaused(supabase, { conversationId: 'conv-1', paused: false });

    expect(rpc).toHaveBeenCalledWith('set_professional_self_reply_paused', { p_conversation_id: 'conv-1', p_paused: false });
  });

  it('nunca engole um erro real do RPC — propaga como exceção', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const supabase = { rpc } as never;

    await expect(setProfessionalSelfReplyPaused(supabase, { conversationId: 'conv-1', paused: true })).rejects.toThrow('falha simulada');
  });
});
