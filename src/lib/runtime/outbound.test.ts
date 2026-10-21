import { describe, expect, it } from 'vitest';

import { createOutboundIntent } from './outbound';

// P1 UX conversacional (14/10/2026) — createOutboundIntent sanitiza o
// travessão do draft gerado pela Doopla (sendAs='free_text', default),
// mas NUNCA toca conteúdo de template (texto pré-aprovado pela Meta,
// byte-exato — sanitizar quebraria a aprovação).

function fakeSupabase(onRpc: (args: Record<string, unknown>) => void) {
  return {
    rpc(_fn: string, args: Record<string, unknown>) {
      onRpc(args);
      const result = { data: { id: 'intent-1' }, error: null };
      return { single: async () => result };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const BASE_PARAMS = {
  conversationId: 'conv-1',
  triggerMessageId: 'msg-1',
  runId: null,
  policyDecisionId: null,
  channel: 'whatsapp',
  recipientExternalParticipantId: 'participant-1',
};

describe('createOutboundIntent', () => {
  it('sanitiza travessão do conteúdo quando sendAs é free_text (default)', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = fakeSupabase((args) => {
      captured = args;
    });

    await createOutboundIntent(supabase, { ...BASE_PARAMS, content: 'Posso ajudar — só preciso de um detalhe.' });

    expect(captured!.p_content).toBe('Posso ajudar, só preciso de um detalhe.');
  });

  it('NUNCA sanitiza conteúdo de template — texto pré-aprovado pela Meta precisa ficar byte-exato', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = fakeSupabase((args) => {
      captured = args;
    });

    const templateContent = 'Oi! Sou a Doopla da Duda — ela avisou que tem uma gig em novembro.';
    await createOutboundIntent(supabase, { ...BASE_PARAMS, content: templateContent, sendAs: 'template' });

    expect(captured!.p_content).toBe(templateContent);
  });
});
