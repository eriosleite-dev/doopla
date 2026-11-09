import { describe, expect, it } from 'vitest';

import {
  cancelPendingDelegatedContact,
  claimPendingDelegatedContactDecision,
  claimPendingDelegatedContactForLiteralContentSend,
  claimPendingDelegatedContactForTemplateExecution,
  claimPendingDelegatedContactLiteralContentDecision,
  createDelegatedContactConversation,
  createPendingDelegatedContact,
  expireStalePendingDelegatedContacts,
  getMostRecentPendingDelegatedContact,
  getPendingDelegatedContactAwaitingReplyByConversation,
  listPendingDelegatedContactsDueForNoReplyExpiry,
  listPendingDelegatedContactsWithExpiredExecutionLease,
  markPendingDelegatedContactExecuted,
  markPendingDelegatedContactExpiredNoReply,
  markPendingDelegatedContactFailed,
  markPendingDelegatedContactLiteralContentFailed,
  markPendingDelegatedContactLiteralContentSent,
  preparePendingDelegatedContactApproval,
  preparePendingDelegatedContactLiteralContentReview,
  setPendingDelegatedContactRecipientReply,
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

// Etapa 2.1 (migration 0109) — mesma disciplina: nunca toca banco
// real, só confirma a RPC certa e o mapeamento granted=true/false.

describe('claimPendingDelegatedContactForTemplateExecution', () => {
  it('granted=true devolve os dados pra criar participante/conversation/outbound_intent', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      expect(fn).toBe('claim_pending_delegated_contact_for_template_execution');
      return {
        data: {
          granted: true,
          requesting_professional_id: 'prof-1',
          conversation_id: 'conv-self-1',
          recipient_number: '+5511999999999',
          recipient_name: 'Marina',
          draft_message_content: 'Oi Marina...',
        },
        error: null,
      };
    });

    const result = await claimPendingDelegatedContactForTemplateExecution(supabase, { id: 'pdc-1', workerId: 'cron:x' });

    expect(capturedArgs).toEqual({ p_id: 'pdc-1', p_worker_id: 'cron:x', p_lease_seconds: 60 });
    expect(result).toEqual({
      granted: true,
      requestingProfessionalId: 'prof-1',
      conversationId: 'conv-self-1',
      recipientNumber: '+5511999999999',
      recipientName: 'Marina',
      draftMessageContent: 'Oi Marina...',
    });
  });

  it('granted=false quando outro worker já reclamou (claim perdido)', async () => {
    const supabase = fakeSupabase(() => ({
      data: { granted: false, requesting_professional_id: null, conversation_id: null, recipient_number: null, recipient_name: null, draft_message_content: null },
      error: null,
    }));
    const result = await claimPendingDelegatedContactForTemplateExecution(supabase, { id: 'pdc-1', workerId: 'cron:x' });
    expect(result).toEqual({ granted: false });
  });
});

describe('createDelegatedContactConversation', () => {
  it('monta a RPC certa (equivalente de create_conversation pra service_role)', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      expect(fn).toBe('create_delegated_contact_conversation');
      return { data: { id: 'conv-ext-1' }, error: null };
    });
    const result = await createDelegatedContactConversation(supabase, { professionalId: 'prof-1', externalParticipantId: 'ep-1' });
    expect(capturedArgs).toEqual({ p_professional_id: 'prof-1', p_external_participant_id: 'ep-1' });
    expect(result).toEqual({ id: 'conv-ext-1' });
  });
});

describe('setPendingDelegatedContactRecipientReply', () => {
  it('monta a RPC certa com o outcome informado', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      expect(fn).toBe('set_pending_delegated_contact_recipient_reply');
      return { data: true, error: null };
    });
    const result = await setPendingDelegatedContactRecipientReply(supabase, { id: 'pdc-1', messageId: 'msg-reply-1', outcome: 'proceed' });
    expect(capturedArgs).toEqual({ p_id: 'pdc-1', p_message_id: 'msg-reply-1', p_outcome: 'proceed' });
    expect(result).toBe(true);
  });

  it('devolve false quando o gate já avançou (repetição nunca reprocessa)', async () => {
    const supabase = fakeSupabase(() => ({ data: false, error: null }));
    expect(await setPendingDelegatedContactRecipientReply(supabase, { id: 'pdc-1', messageId: 'msg-2', outcome: 'declined' })).toBe(false);
  });
});

describe('preparePendingDelegatedContactLiteralContentReview', () => {
  it('monta a RPC certa', async () => {
    let capturedArgs: unknown;
    const supabase = fakeSupabase((fn, args) => {
      capturedArgs = args;
      expect(fn).toBe('prepare_pending_delegated_contact_literal_content_review');
      return { data: true, error: null };
    });
    await preparePendingDelegatedContactLiteralContentReview(supabase, { id: 'pdc-1', confirmationMessageId: 'msg-review-q-1' });
    expect(capturedArgs).toEqual({ p_id: 'pdc-1', p_confirmation_message_id: 'msg-review-q-1' });
  });
});

describe('claimPendingDelegatedContactLiteralContentDecision', () => {
  it('granted=true devolve os dados pra enviar', async () => {
    const supabase = fakeSupabase((fn) => {
      expect(fn).toBe('claim_pending_delegated_contact_literal_content_decision');
      return {
        data: { granted: true, requesting_professional_id: 'prof-1', conversation_id: 'conv-ext-1', recipient_number: '+5511999999999', draft_message_content: 'Oi Marina...' },
        error: null,
      };
    });
    const result = await claimPendingDelegatedContactLiteralContentDecision(supabase, {
      id: 'pdc-1',
      expectedConfirmationMessageId: 'msg-review-q-1',
      decisionMessageId: 'msg-review-decision-1',
      approved: true,
    });
    expect(result).toEqual({
      granted: true,
      requestingProfessionalId: 'prof-1',
      conversationId: 'conv-ext-1',
      recipientNumber: '+5511999999999',
      draftMessageContent: 'Oi Marina...',
    });
  });

  it('granted=false (confirmation_message_id desatualizado) nunca confunde com o gate original', async () => {
    const supabase = fakeSupabase(() => ({
      data: { granted: false, requesting_professional_id: null, conversation_id: null, recipient_number: null, draft_message_content: null },
      error: null,
    }));
    const result = await claimPendingDelegatedContactLiteralContentDecision(supabase, {
      id: 'pdc-1',
      expectedConfirmationMessageId: 'msg-STALE',
      decisionMessageId: 'msg-2',
      approved: true,
    });
    expect(result).toEqual({ granted: false });
  });
});

describe('claimPendingDelegatedContactForLiteralContentSend / mark sent/failed', () => {
  it('claim granted=true + mark sent devolvem os dados/booleano certos', async () => {
    const supabaseClaim = fakeSupabase((fn) => {
      expect(fn).toBe('claim_pending_delegated_contact_for_literal_content_send');
      return {
        data: {
          granted: true,
          requesting_professional_id: 'prof-1',
          conversation_id: 'conv-ext-1',
          professional_self_conversation_id: 'conv-self-1',
          recipient_number: '+5511999999999',
          draft_message_content: 'Oi Marina...',
        },
        error: null,
      };
    });
    const claimResult = await claimPendingDelegatedContactForLiteralContentSend(supabaseClaim, { id: 'pdc-1', workerId: 'cron:x' });
    expect(claimResult).toEqual({
      granted: true,
      requestingProfessionalId: 'prof-1',
      conversationId: 'conv-ext-1',
      professionalSelfConversationId: 'conv-self-1',
      recipientNumber: '+5511999999999',
      draftMessageContent: 'Oi Marina...',
    });

    const supabaseMark = fakeSupabase((fn) => {
      expect(fn).toBe('mark_pending_delegated_contact_literal_content_sent');
      return { data: true, error: null };
    });
    expect(await markPendingDelegatedContactLiteralContentSent(supabaseMark, { id: 'pdc-1', outboundIntentId: 'oi-literal-1' })).toBe(true);
  });

  it('mark failed devolve false quando já resolvido (idempotência)', async () => {
    const supabase = fakeSupabase(() => ({ data: false, error: null }));
    expect(await markPendingDelegatedContactLiteralContentFailed(supabase, { id: 'pdc-1' })).toBe(false);
  });
});

describe('markPendingDelegatedContactExpiredNoReply / sweeps', () => {
  it('mark devolve a linha completa quando a transição aconteceu', async () => {
    const supabase = fakeSupabase((fn) => {
      expect(fn).toBe('mark_pending_delegated_contact_expired_no_reply');
      return { data: { ...RAW_ROW, status: 'expired_no_reply' }, error: null };
    });
    const result = await markPendingDelegatedContactExpiredNoReply(supabase, { id: 'pdc-1' });
    expect(result?.status).toBe('expired_no_reply');
  });

  it('mark devolve null quando a linha não era mais elegível (idempotência)', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: null }));
    expect(await markPendingDelegatedContactExpiredNoReply(supabase, { id: 'pdc-1' })).toBeNull();
  });

  it('sweeps devolvem a lista de ids', async () => {
    const supabaseNoReply = fakeSupabase((fn) => {
      expect(fn).toBe('list_pending_delegated_contacts_due_for_no_reply_expiry');
      return { data: ['pdc-1', 'pdc-2'], error: null };
    });
    expect(await listPendingDelegatedContactsDueForNoReplyExpiry(supabaseNoReply)).toEqual(['pdc-1', 'pdc-2']);

    const supabaseLease = fakeSupabase((fn) => {
      expect(fn).toBe('list_pending_delegated_contacts_with_expired_execution_lease');
      return { data: [{ id: 'pdc-3' }], error: null };
    });
    expect(await listPendingDelegatedContactsWithExpiredExecutionLease(supabaseLease)).toEqual(['pdc-3']);
  });
});

describe('getMostRecentPendingDelegatedContact / getPendingDelegatedContactAwaitingReplyByConversation', () => {
  it('devolve null quando não há linha (RPC devolve data null, nunca erro)', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: null }));
    expect(await getMostRecentPendingDelegatedContact(supabase, { professionalId: 'prof-1' })).toBeNull();
    expect(await getPendingDelegatedContactAwaitingReplyByConversation(supabase, { conversationId: 'conv-1' })).toBeNull();
  });

  it('mapeia a linha pro formato camelCase quando existe', async () => {
    const supabase = fakeSupabase((fn, args) => {
      expect(fn).toBe('get_most_recent_pending_delegated_contact');
      expect(args).toEqual({ p_professional_id: 'prof-1' });
      return { data: { ...RAW_ROW, literal_content_gate: 'awaiting_recipient_reply' }, error: null };
    });
    const result = await getMostRecentPendingDelegatedContact(supabase, { professionalId: 'prof-1' });
    expect(result?.literalContentGate).toBe('awaiting_recipient_reply');
  });
});
