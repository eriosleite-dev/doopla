import { describe, expect, it, vi } from 'vitest';

import { claimProfessionalSelfWhatsappSend } from './professional-self-whatsapp-sends';

// ADR 0009 (20/10/2026) — wrapper fino sobre claim_professional_self_whatsapp_send
// (migration 0122). Cobre só o contrato do wrapper: RPC chamado com os
// parâmetros certos, true/false propagados, erro real nunca engolido.

describe('claimProfessionalSelfWhatsappSend', () => {
  it('chama o RPC com p_ai_message_id e devolve true quando a RPC devolve true', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = { rpc } as never;

    const result = await claimProfessionalSelfWhatsappSend(supabase, { aiMessageId: 'msg-1' });

    expect(rpc).toHaveBeenCalledWith('claim_professional_self_whatsapp_send', { p_ai_message_id: 'msg-1' });
    expect(result).toBe(true);
  });

  it('devolve false quando a RPC devolve false (já reivindicado antes)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const supabase = { rpc } as never;

    const result = await claimProfessionalSelfWhatsappSend(supabase, { aiMessageId: 'msg-1' });

    expect(result).toBe(false);
  });

  it('nunca engole um erro real da RPC — propaga como exceção', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha simulada' } });
    const supabase = { rpc } as never;

    await expect(claimProfessionalSelfWhatsappSend(supabase, { aiMessageId: 'msg-1' })).rejects.toThrow('falha simulada');
  });
});
