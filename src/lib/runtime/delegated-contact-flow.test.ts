import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — "Doopla chama o cliente" (Etapa 2.1). Mesma disciplina de
// professional-self-pending-messages.test.ts: um FakeDb que replica a
// semântica real das RPCs da migration 0109 (guardas de estado,
// idempotência, claim atômico) — não um mock raso de resposta única,
// porque o que está sob teste é a SEQUÊNCIA de chamadas através de
// múltiplos turnos. Cobre o cenário ponta a ponta exigido pela
// fundadora: pedido -> confirmação única -> template -> resposta do
// destinatário -> envio literal -> status real; mais idempotência sob
// repetição/concorrência, falha de consentimento, e expiração por
// ausência de resposta.

vi.mock('./professional-whatsapp-reply', () => ({ sendProfessionalSelfReplyViaWhatsapp: vi.fn(async () => {}) }));
vi.mock('./professional-identity', () => ({ resolveProfessionalDisplayName: vi.fn(async () => 'Marina Profissional') }));

type PdcRow = {
  id: string;
  requesting_professional_id: string;
  conversation_id: string;
  trigger_message_id: string;
  recipient_name: string | null;
  recipient_number: string | null;
  purpose_summary: string;
  draft_message_content: string | null;
  confirmation_message_id: string | null;
  decision_message_id: string | null;
  status: string;
  created_conversation_id: string | null;
  created_outbound_intent_id: string | null;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
  no_reply_deadline_at: string | null;
  literal_content_gate: string;
  recipient_first_reply_message_id: string | null;
  literal_content_confirmation_message_id: string | null;
  literal_content_decision_message_id: string | null;
  literal_content_outbound_intent_id: string | null;
};

class FakeDb {
  rows = new Map<string, PdcRow>();
  outboundIntents = new Map<string, { delivery_state: string }>();
  participants = new Map<string, string>(); // `${professionalId}|${identifier}` -> participant id
  conversations = new Map<string, string>(); // `${professionalId}|${participantId}` -> conversation id
  // Default 'true' — testes de orquestração existentes exercitam o
  // fluxo com a proteção já ligada; o gate em si tem teste dedicado.
  appSettings = new Map<string, string>([['delegated_contact_enabled', 'true']]);
  seq = 0;

  nextId(prefix: string): string {
    this.seq++;
    return `${prefix}-${this.seq}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase(): any {
    return {
      rpc: (fn: string, args: Record<string, unknown>) => {
        const result = this.handleRpc(fn, args);
        return {
          single: async () => ({ data: result, error: null }),
          then: (resolve: (v: unknown) => void) => Promise.resolve({ data: result, error: null }).then(resolve),
        };
      },
      from: (table: string) => {
        if (table === 'outbound_intents') {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => ({ data: this.outboundIntents.get(id) ?? null }),
              }),
            }),
          };
        }
        if (table === 'app_settings') {
          return {
            select: () => ({
              eq: (_col: string, key: string) => ({
                maybeSingle: async () => ({ data: { value: this.appSettings.get(key) ?? 'false' } }),
              }),
            }),
          };
        }
        throw new Error(`FakeDb.from não implementa a tabela ${table}`);
      },
    };
  }

  handleRpc(fn: string, args: Record<string, unknown>): unknown {
    switch (fn) {
      case 'create_pending_delegated_contact': {
        const id = this.nextId('pdc');
        const row: PdcRow = {
          id,
          requesting_professional_id: args.p_requesting_professional_id as string,
          conversation_id: args.p_conversation_id as string,
          trigger_message_id: args.p_trigger_message_id as string,
          recipient_name: (args.p_recipient_name as string | null) ?? null,
          recipient_number: (args.p_recipient_number as string | null) ?? null,
          purpose_summary: args.p_purpose_summary as string,
          draft_message_content: null,
          confirmation_message_id: null,
          decision_message_id: null,
          status: 'pending_number',
          created_conversation_id: null,
          created_outbound_intent_id: null,
          expires_at: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
          no_reply_deadline_at: null,
          literal_content_gate: 'not_applicable',
          recipient_first_reply_message_id: null,
          literal_content_confirmation_message_id: null,
          literal_content_decision_message_id: null,
          literal_content_outbound_intent_id: null,
        };
        this.rows.set(id, row);
        return row;
      }

      case 'update_pending_delegated_contact_pending_info': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'pending_number') throw new Error('pending_delegated_contact_not_updatable');
        row.recipient_name = (args.p_recipient_name as string | null) ?? row.recipient_name;
        row.recipient_number = (args.p_recipient_number as string | null) ?? row.recipient_number;
        row.draft_message_content = (args.p_draft_message_content as string | null) ?? row.draft_message_content;
        row.purpose_summary = (args.p_purpose_summary as string | null) ?? row.purpose_summary;
        return row;
      }

      case 'prepare_pending_delegated_contact_approval': {
        const row = this.rows.get(args.p_id as string);
        if (!row || !['pending_number', 'pending_approval'].includes(row.status)) throw new Error('pending_delegated_contact_not_preparable');
        row.recipient_number = args.p_recipient_number as string;
        row.draft_message_content = args.p_draft_message_content as string;
        row.confirmation_message_id = args.p_confirmation_message_id as string;
        row.decision_message_id = null;
        row.status = 'pending_approval';
        return row;
      }

      case 'claim_pending_delegated_contact_decision': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'pending_approval' || row.confirmation_message_id !== args.p_expected_confirmation_message_id) {
          return { granted: false, conversation_id: null, requesting_professional_id: null, recipient_number: null, draft_message_content: null };
        }
        row.status = args.p_approved ? 'approved' : 'rejected';
        row.decision_message_id = args.p_decision_message_id as string;
        return { granted: true, conversation_id: row.conversation_id, requesting_professional_id: row.requesting_professional_id, recipient_number: row.recipient_number, draft_message_content: row.draft_message_content };
      }

      case 'cancel_pending_delegated_contact': {
        const row = this.rows.get(args.p_id as string);
        if (!row || !['pending_number', 'pending_approval'].includes(row.status)) return false;
        row.status = 'cancelled';
        row.decision_message_id = args.p_decision_message_id as string;
        return true;
      }

      case 'claim_pending_delegated_contact_for_template_execution': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'approved') {
          return { granted: false, requesting_professional_id: null, conversation_id: null, recipient_number: null, recipient_name: null, draft_message_content: null };
        }
        row.status = 'executing';
        return {
          granted: true,
          requesting_professional_id: row.requesting_professional_id,
          conversation_id: row.conversation_id,
          recipient_number: row.recipient_number,
          recipient_name: row.recipient_name,
          draft_message_content: row.draft_message_content,
        };
      }

      case 'mark_pending_delegated_contact_executed': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'executing') return false;
        row.status = 'executed';
        row.created_conversation_id = args.p_created_conversation_id as string;
        row.created_outbound_intent_id = args.p_created_outbound_intent_id as string;
        row.no_reply_deadline_at = new Date(Date.now() + (args.p_no_reply_hours as number) * 3600_000).toISOString();
        row.literal_content_gate = 'awaiting_recipient_reply';
        return true;
      }

      case 'mark_pending_delegated_contact_failed': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'executing') return false;
        row.status = 'failed';
        return true;
      }

      case 'create_delegated_contact_conversation': {
        const key = `${args.p_professional_id}|${args.p_external_participant_id}`;
        const existing = this.conversations.get(key);
        if (existing) return { id: existing };
        const id = this.nextId('conv-ext');
        this.conversations.set(key, id);
        return { id };
      }

      case 'set_pending_delegated_contact_recipient_reply': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'executed' || row.literal_content_gate !== 'awaiting_recipient_reply') return false;
        row.recipient_first_reply_message_id = args.p_message_id as string;
        row.literal_content_gate = args.p_outcome === 'proceed' ? 'approved_to_send' : args.p_outcome === 'declined' ? 'declined_by_recipient' : 'awaiting_recipient_review';
        return true;
      }

      case 'prepare_pending_delegated_contact_literal_content_review': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.literal_content_gate !== 'awaiting_recipient_review') return false;
        row.literal_content_confirmation_message_id = args.p_confirmation_message_id as string;
        row.literal_content_decision_message_id = null;
        return true;
      }

      case 'claim_pending_delegated_contact_literal_content_decision': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.literal_content_gate !== 'awaiting_recipient_review' || row.literal_content_confirmation_message_id !== args.p_expected_confirmation_message_id) {
          return { granted: false, requesting_professional_id: null, conversation_id: null, recipient_number: null, draft_message_content: null };
        }
        row.literal_content_gate = args.p_approved ? 'approved_to_send' : 'declined_by_recipient';
        row.literal_content_decision_message_id = args.p_decision_message_id as string;
        return { granted: true, requesting_professional_id: row.requesting_professional_id, conversation_id: row.created_conversation_id, recipient_number: row.recipient_number, draft_message_content: row.draft_message_content };
      }

      case 'claim_pending_delegated_contact_for_literal_content_send': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.literal_content_gate !== 'approved_to_send') {
          return { granted: false, requesting_professional_id: null, conversation_id: null, professional_self_conversation_id: null, recipient_number: null, draft_message_content: null };
        }
        row.literal_content_gate = 'sending';
        return {
          granted: true,
          requesting_professional_id: row.requesting_professional_id,
          conversation_id: row.created_conversation_id,
          professional_self_conversation_id: row.conversation_id,
          recipient_number: row.recipient_number,
          draft_message_content: row.draft_message_content,
        };
      }

      case 'mark_pending_delegated_contact_literal_content_sent': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.literal_content_gate !== 'sending') return false;
        row.literal_content_gate = 'sent';
        row.literal_content_outbound_intent_id = args.p_outbound_intent_id as string;
        return true;
      }

      case 'mark_pending_delegated_contact_literal_content_failed': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.literal_content_gate !== 'sending') return false;
        row.literal_content_gate = 'failed';
        return true;
      }

      case 'mark_pending_delegated_contact_expired_no_reply': {
        const row = this.rows.get(args.p_id as string);
        if (!row || row.status !== 'executed' || row.literal_content_gate !== 'awaiting_recipient_reply') return null;
        if (!row.no_reply_deadline_at || new Date(row.no_reply_deadline_at).getTime() >= Date.now()) return null;
        row.status = 'expired_no_reply';
        return row;
      }

      case 'get_most_recent_pending_delegated_contact': {
        const rows = [...this.rows.values()].filter((r) => r.requesting_professional_id === args.p_professional_id);
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return rows[0] ?? null;
      }

      case 'get_pending_delegated_contact_awaiting_reply_by_conversation': {
        return [...this.rows.values()].find((r) => r.created_conversation_id === args.p_conversation_id && r.status === 'executed' && r.literal_content_gate === 'awaiting_recipient_reply') ?? null;
      }

      case 'resolve_or_create_external_participant': {
        const key = `${args.p_professional_id}|${args.p_identifier}`;
        const existing = this.participants.get(key);
        if (existing) return { id: existing };
        const id = this.nextId('ep');
        this.participants.set(key, id);
        return { id };
      }

      case 'create_outbound_intent': {
        const id = this.nextId('oi');
        this.outboundIntents.set(id, { delivery_state: 'policy_allowed' });
        return { id };
      }

      case 'persist_ai_message':
        return { id: this.nextId('msg-ai') };

      default:
        throw new Error(`FakeDb.rpc não implementa ${fn}`);
    }
  }
}

describe('delegated-contact-flow (ponta a ponta)', () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    vi.clearAllMocks();
  });

  it('pedido completo -> confirmação única -> template -> resposta -> envio literal -> status real', async () => {
    const { runDelegatedContactRequestFlow, runDelegatedContactRecipientReplyFlow } = await import('./delegated-contact-flow');
    const supabase = db.supabase();
    const professionalId = 'prof-1';
    const professionalSelfConversationId = 'conv-self-1';

    const recognizerNewRequest = async () => ({ parsed: { signal: 'new_request', recipientName: 'Marina Cliente', recipientNumber: '11999999999', purposeSummary: 'confirmar evento', draftMessageContent: 'Confirma presença no evento de sábado?' } as const, inputTokens: 1, outputTokens: 1 });

    // Turno 1: pedido completo (número + texto já vêm juntos).
    const r1 = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId, conversationId: professionalSelfConversationId, triggerMessageId: 'msg-1', messageText: "manda pra Marina, 11999999999: 'Confirma presença no evento de sábado?'", channel: 'whatsapp' },
      { recognizerModelCall: recognizerNewRequest }
    );
    expect(r1.handled).toBe(true);
    const afterRequest = [...db.rows.values()][0];
    expect(afterRequest.status).toBe('pending_approval');
    expect(afterRequest.draft_message_content).toBe('Confirma presença no evento de sábado?');
    expect(afterRequest.confirmation_message_id).not.toBeNull();

    // Turno 2: profissional confirma com "sim" -> claim único, template executado.
    const recognizerConfirms = async () => ({ parsed: { signal: 'confirms_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null } as const, inputTokens: 1, outputTokens: 1 });
    const r2 = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId, conversationId: professionalSelfConversationId, triggerMessageId: 'msg-2', messageText: 'sim, pode mandar', channel: 'whatsapp' },
      { recognizerModelCall: recognizerConfirms }
    );
    expect(r2.handled).toBe(true);
    const afterExecution = db.rows.get(afterRequest.id)!;
    expect(afterExecution.status).toBe('executed');
    expect(afterExecution.literal_content_gate).toBe('awaiting_recipient_reply');
    expect(afterExecution.created_conversation_id).not.toBeNull();
    expect(afterExecution.created_outbound_intent_id).not.toBeNull();
    const externalConversationId = afterExecution.created_conversation_id!;

    // Confirmar de novo (repetição/duplicidade) NUNCA reexecuta — mesmo confirmation_message_id já não bate mais (gate mudou).
    const r2b = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId, conversationId: professionalSelfConversationId, triggerMessageId: 'msg-2b', messageText: 'sim, pode mandar', channel: 'whatsapp' },
      { recognizerModelCall: recognizerConfirms }
    );
    expect(r2b.handled).toBe(false); // recent.status já não é 'pending_approval' -> fora do escopo deste fluxo
    expect(db.outboundIntents.size).toBe(1); // nenhum outbound_intent extra criado

    // Turno 3: destinatário responde de forma receptiva -> consentimento liberado, texto literal enviado.
    const consentProceed = async () => ({ parsed: { outcome: 'proceed' } as const, inputTokens: 1, outputTokens: 1 });
    const r3 = await runDelegatedContactRecipientReplyFlow(
      supabase,
      { conversationId: externalConversationId, messageId: 'msg-reply-1', messageText: 'oi, pode falar sim' },
      { consentModelCall: consentProceed }
    );
    expect(r3.handled).toBe(true);
    const afterLiteralSend = db.rows.get(afterRequest.id)!;
    expect(afterLiteralSend.literal_content_gate).toBe('sent');
    expect(afterLiteralSend.literal_content_outbound_intent_id).not.toBeNull();
    expect(db.outboundIntents.size).toBe(2); // template + literal, nunca um 3º

    // Repetir a mesma resposta do destinatário (webhook duplicado/concorrência) NUNCA reprocessa.
    const r3b = await runDelegatedContactRecipientReplyFlow(
      supabase,
      { conversationId: externalConversationId, messageId: 'msg-reply-1-dup', messageText: 'oi, pode falar sim' },
      { consentModelCall: consentProceed }
    );
    expect(r3b.handled).toBe(false); // gate já avançou -> getPendingDelegatedContactAwaitingReplyByConversation acha null, nunca reprocessa
    expect(db.outboundIntents.size).toBe(2);

    // Turno 4: profissional pergunta "enviou?" -> status real, nunca Planner, nunca nova autorização.
    const r4 = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId, conversationId: professionalSelfConversationId, triggerMessageId: 'msg-4', messageText: 'enviou?', channel: 'whatsapp' },
      { recognizerModelCall: async () => ({ parsed: { signal: 'status_inquiry', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null } as const, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(r4.handled).toBe(true);
  });

  it('destinatário recusa -> nunca envia o texto literal', async () => {
    const { runDelegatedContactRecipientReplyFlow } = await import('./delegated-contact-flow');
    const supabase = db.supabase();
    const row = db.rows.set('pdc-1', {
      id: 'pdc-1',
      requesting_professional_id: 'prof-1',
      conversation_id: 'conv-self-1',
      trigger_message_id: 'msg-1',
      recipient_name: 'Marina',
      recipient_number: '11999999999',
      purpose_summary: 'x',
      draft_message_content: 'texto original',
      confirmation_message_id: 'msg-c1',
      decision_message_id: 'msg-d1',
      status: 'executed',
      created_conversation_id: 'conv-ext-1',
      created_outbound_intent_id: 'oi-1',
      expires_at: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      no_reply_deadline_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
      literal_content_gate: 'awaiting_recipient_reply',
      recipient_first_reply_message_id: null,
      literal_content_confirmation_message_id: null,
      literal_content_decision_message_id: null,
      literal_content_outbound_intent_id: null,
    });
    void row;

    const result = await runDelegatedContactRecipientReplyFlow(
      supabase,
      { conversationId: 'conv-ext-1', messageId: 'msg-reply-decline', messageText: 'não quero receber mensagens, para de mandar' },
      { consentModelCall: async () => ({ parsed: { outcome: 'declined' } as const, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(result.handled).toBe(true);
    expect(db.rows.get('pdc-1')!.literal_content_gate).toBe('declined_by_recipient');
    expect(db.outboundIntents.size).toBe(0); // nenhum outbound_intent de texto literal foi criado
  });

  it('resposta ambígua -> pausa pra revisão da profissional, só envia depois de novo "sim"', async () => {
    const { runDelegatedContactRequestFlow, runDelegatedContactRecipientReplyFlow } = await import('./delegated-contact-flow');
    const supabase = db.supabase();
    db.rows.set('pdc-1', {
      id: 'pdc-1',
      requesting_professional_id: 'prof-1',
      conversation_id: 'conv-self-1',
      trigger_message_id: 'msg-1',
      recipient_name: 'Marina',
      recipient_number: '11999999999',
      purpose_summary: 'x',
      draft_message_content: 'texto original',
      confirmation_message_id: 'msg-c1',
      decision_message_id: 'msg-d1',
      status: 'executed',
      created_conversation_id: 'conv-ext-1',
      created_outbound_intent_id: 'oi-1',
      expires_at: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      no_reply_deadline_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
      literal_content_gate: 'awaiting_recipient_reply',
      recipient_first_reply_message_id: null,
      literal_content_confirmation_message_id: null,
      literal_content_decision_message_id: null,
      literal_content_outbound_intent_id: null,
    });

    const r1 = await runDelegatedContactRecipientReplyFlow(
      supabase,
      { conversationId: 'conv-ext-1', messageId: 'msg-reply-ambig', messageText: 'quem é você?' },
      { consentModelCall: async () => ({ parsed: { outcome: 'ambiguous' } as const, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(r1.handled).toBe(true);
    const afterAmbiguous = db.rows.get('pdc-1')!;
    expect(afterAmbiguous.literal_content_gate).toBe('awaiting_recipient_review');
    expect(afterAmbiguous.literal_content_confirmation_message_id).not.toBeNull();
    expect(db.outboundIntents.size).toBe(0); // nunca envia enquanto ambíguo

    // Profissional confirma mesmo assim -> SÓ ENTÃO envia.
    const r2 = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId: 'prof-1', conversationId: 'conv-self-1', triggerMessageId: 'msg-2', messageText: 'sim, manda mesmo assim', channel: 'whatsapp' },
      { recognizerModelCall: async () => ({ parsed: { signal: 'confirms_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null } as const, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(r2.handled).toBe(true);
    expect(db.rows.get('pdc-1')!.literal_content_gate).toBe('sent');
    expect(db.outboundIntents.size).toBe(1);
  });

  it('API falha ao criar o outbound_intent do template -> marca failed, nunca fica presa em executing', async () => {
    const { runDelegatedContactRequestFlow } = await import('./delegated-contact-flow');
    const supabase = db.supabase();
    db.rows.set('pdc-1', {
      id: 'pdc-1',
      requesting_professional_id: 'prof-1',
      conversation_id: 'conv-self-1',
      trigger_message_id: 'msg-1',
      recipient_name: 'Marina',
      recipient_number: '11999999999',
      purpose_summary: 'x',
      draft_message_content: 'texto original',
      confirmation_message_id: 'msg-c1',
      decision_message_id: null,
      status: 'pending_approval',
      created_conversation_id: null,
      created_outbound_intent_id: null,
      expires_at: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      no_reply_deadline_at: null,
      literal_content_gate: 'not_applicable',
      recipient_first_reply_message_id: null,
      literal_content_confirmation_message_id: null,
      literal_content_decision_message_id: null,
      literal_content_outbound_intent_id: null,
    });

    // create_delegated_contact_conversation falha (simula erro de rede/Meta).
    const realHandle = db.handleRpc.bind(db);
    vi.spyOn(db, 'handleRpc' as never).mockImplementation(((fn: string, args: Record<string, unknown>) => {
      if (fn === 'create_delegated_contact_conversation') throw new Error('boom');
      return realHandle(fn, args);
    }) as never);

    const result = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId: 'prof-1', conversationId: 'conv-self-1', triggerMessageId: 'msg-2', messageText: 'sim', channel: 'whatsapp' },
      { recognizerModelCall: async () => ({ parsed: { signal: 'confirms_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null } as const, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(result.handled).toBe(true);
    expect(db.rows.get('pdc-1')!.status).toBe('failed');
  });

  it('expiração por ausência de resposta: nunca fica pendente indefinidamente, e nunca avisa duas vezes', async () => {
    const { sweepDelegatedContactExpirations } = await import('./delegated-contact-flow');
    const supabase = db.supabase();
    db.rows.set('pdc-1', {
      id: 'pdc-1',
      requesting_professional_id: 'prof-1',
      conversation_id: 'conv-self-1',
      trigger_message_id: 'msg-1',
      recipient_name: 'Marina',
      recipient_number: '11999999999',
      purpose_summary: 'x',
      draft_message_content: 'texto original',
      confirmation_message_id: 'msg-c1',
      decision_message_id: 'msg-d1',
      status: 'executed',
      created_conversation_id: 'conv-ext-1',
      created_outbound_intent_id: 'oi-1',
      expires_at: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      no_reply_deadline_at: new Date(Date.now() - 1000).toISOString(), // já venceu
      literal_content_gate: 'awaiting_recipient_reply',
      recipient_first_reply_message_id: null,
      literal_content_confirmation_message_id: null,
      literal_content_decision_message_id: null,
      literal_content_outbound_intent_id: null,
    });

    const r1 = await sweepDelegatedContactExpirations(supabase, { dueForNoReply: ['pdc-1'] });
    expect(r1.expiredNoReply).toBe(1);
    expect(db.rows.get('pdc-1')!.status).toBe('expired_no_reply');

    // 2ª passada do sweep sobre o mesmo id (ex.: cron rodou de novo antes da lista ser refrescada) -> nunca reprocessa/avisa de novo.
    const r2 = await sweepDelegatedContactExpirations(supabase, { dueForNoReply: ['pdc-1'] });
    expect(r2.expiredNoReply).toBe(0);
  });
});

describe('proteção de ativação (app_settings.delegated_contact_enabled)', () => {
  it('desligada (default de produção pós-deploy): nenhum pedido novo é reconhecido, nem o recognizer é chamado', async () => {
    const { runDelegatedContactRequestFlow } = await import('./delegated-contact-flow');
    const db = new FakeDb();
    const supabase = db.supabase();
    db.appSettings.set('delegated_contact_enabled', 'false');

    let recognizerCalled = false;
    const result = await runDelegatedContactRequestFlow(
      supabase,
      { professionalId: 'prof-1', conversationId: 'conv-self-1', triggerMessageId: 'msg-1', messageText: "manda pra Marina, 11999999999: 'oi'", channel: 'whatsapp' },
      {
        recognizerModelCall: async () => {
          recognizerCalled = true;
          return { parsed: { signal: 'new_request', recipientName: 'Marina', recipientNumber: '11999999999', purposeSummary: 'x', draftMessageContent: 'oi' } as const, inputTokens: 1, outputTokens: 1 };
        },
      }
    );
    expect(result.handled).toBe(false);
    expect(recognizerCalled).toBe(false);
    expect(db.rows.size).toBe(0);
  });
});
