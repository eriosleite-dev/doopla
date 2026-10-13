import { describe, expect, it } from 'vitest';

import {
  cancelPendingDelegatedContact,
  claimPendingDelegatedContactDecision,
  createPendingDelegatedContact,
  expireStalePendingDelegatedContacts,
  markPendingDelegatedContactExecuted,
  markPendingDelegatedContactFailed,
  preparePendingDelegatedContactApproval,
} from './pending-delegated-contacts';

// Doopla — "Doopla chama o cliente", Etapa 1. Testes dos wrappers
// finos sobre as RPCs de pending_delegated_contacts (migration 0104) —
// nunca toca banco real, só confirma que cada função monta a chamada
// certa e mapeia a resposta/erro corretamente (a lógica de verdade —
// claim atômico, correlação por confirmation_message_id — vive no SQL
// e é validada no teste real pós-deploy, não aqui).

const RAW_ROW = {
  id: 'pdc-1',
  requesting_professional_id: 'prof-1',
  conversation_id: 'conv-self-1',
  trigger_message_id: 'msg-1',
  recipient_name: 'Marina',
  recipient_number: null,
  purpose_summary: 'Ela quer contratar pro evento de novembro',
  draft_message_content: null,
  confirmation_message_id: null,
  decision_message_id: null,
  status: 'pending_number' as const,
  created_conversation_id: null,
  created_outbound_intent_id: null,
  expires_at: null,
  created_at: '2026-10-13T00:00:00Z',
  resolved_at: null,
};

function fakeSupabase(rpcImpl: (fn: string, args: unknown) => { data: unknown; error: unknown }) {
  return {
    rpc(fn: string, args: unknown) {
      const result = rpcImpl(fn, args);
      return {
        single: async () => result,
        then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('createPendingDelegatedContact', () => {
  it('monta a RPC certa e mapeia a linha pro formato camelCase', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      expect(fn).toBe('create_pending_delegated_contact');
      return { data: RAW_ROW, error: null };
    });

    const result = await createPendingDelegatedContact(supabase, {
      requestingProfessionalId: 'prof-1',
      conversationId: 'conv-self-1',
      triggerMessageId: 'msg-1',
      purposeSummary: 'Ela quer contratar pro evento de novembro',
      recipientName: 'Marina',
    });

    expect(capturedArgs).toEqual({
      p_requesting_professional_id: 'prof-1',
      p_conversation_id: 'conv-self-1',
      p_trigger_message_id: 'msg-1',
      p_purpose_summary: 'Ela quer contratar pro evento de novembro',
      p_recipient_name: 'Marina',
      p_recipient_number: null,
    });
    expect(result.id).toBe('pdc-1');
    expect(result.recipientName).toBe('Marina');
    expect(result.status).toBe('pending_number');
  });

  it('propaga erro da RPC como exceção', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: { message: 'boom' } }));
    await expect(
      createPendingDelegatedContact(supabase, {
        requestingProfessionalId: 'prof-1',
        conversationId: 'conv-self-1',
        triggerMessageId: 'msg-1',
        purposeSummary: 'x',
      })
    ).rejects.toThrow('boom');
  });
});

describe('preparePendingDelegatedContactApproval', () => {
  it('envia os parâmetros certos, incluindo o novo confirmation_message_id', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      return { data: { ...RAW_ROW, status: 'pending_approval', recipient_number: '+5511999999999' }, error: null };
    });

    const result = await preparePendingDelegatedContactApproval(supabase, {
      id: 'pdc-1',
      recipientNumber: '+5511999999999',
      draftMessageContent: 'Oi Marina, aqui é a Doopla...',
      confirmationMessageId: 'msg-confirm-1',
    });

    expect(capturedArgs).toEqual({
      p_id: 'pdc-1',
      p_recipient_number: '+5511999999999',
      p_draft_message_content: 'Oi Marina, aqui é a Doopla...',
      p_confirmation_message_id: 'msg-confirm-1',
      p_expires_in_hours: 24,
    });
    expect(result.status).toBe('pending_approval');
  });
});

describe('claimPendingDelegatedContactDecision', () => {
  it('granted=true devolve os dados necessários pra execução', async () => {
    const supabase = fakeSupabase(() => ({
      data: {
        granted: true,
        conversation_id: 'conv-self-1',
        requesting_professional_id: 'prof-1',
        recipient_number: '+5511999999999',
        draft_message_content: 'Oi Marina...',
      },
      error: null,
    }));

    const result = await claimPendingDelegatedContactDecision(supabase, {
      id: 'pdc-1',
      expectedConfirmationMessageId: 'msg-confirm-1',
      decisionMessageId: 'msg-decision-1',
      approved: true,
    });

    expect(result).toEqual({
      granted: true,
      conversationId: 'conv-self-1',
      requestingProfessionalId: 'prof-1',
      recipientNumber: '+5511999999999',
      draftMessageContent: 'Oi Marina...',
    });
  });

  it('granted=false (claim perdido ou confirmation_message_id desatualizado) nunca expõe dados parciais', async () => {
    const supabase = fakeSupabase(() => ({
      data: { granted: false, conversation_id: null, requesting_professional_id: null, recipient_number: null, draft_message_content: null },
      error: null,
    }));

    const result = await claimPendingDelegatedContactDecision(supabase, {
      id: 'pdc-1',
      expectedConfirmationMessageId: 'msg-confirm-STALE',
      decisionMessageId: 'msg-decision-1',
      approved: true,
    });

    expect(result).toEqual({ granted: false });
  });
});

describe('cancelPendingDelegatedContact / markPendingDelegatedContactExecuted / markPendingDelegatedContactFailed', () => {
  it('devolvem o booleano direto da RPC (idempotência: false = já resolvido, nunca re-executa)', async () => {
    const supabaseTrue = fakeSupabase(() => ({ data: true, error: null }));
    const supabaseFalse = fakeSupabase(() => ({ data: false, error: null }));

    expect(await cancelPendingDelegatedContact(supabaseTrue, { id: 'pdc-1', decisionMessageId: 'm-1' })).toBe(true);
    expect(await markPendingDelegatedContactExecuted(supabaseFalse, { id: 'pdc-1', createdConversationId: 'c-1', createdOutboundIntentId: 'oi-1' })).toBe(
      false
    );
    expect(await markPendingDelegatedContactFailed(supabaseTrue, { id: 'pdc-1' })).toBe(true);
  });
});

describe('expireStalePendingDelegatedContacts', () => {
  it('devolve a lista de ids expirados', async () => {
    const supabase = fakeSupabase(() => ({ data: [{ id: 'pdc-1' }, { id: 'pdc-2' }], error: null }));
    expect(await expireStalePendingDelegatedContacts(supabase)).toEqual(['pdc-1', 'pdc-2']);
  });
});
