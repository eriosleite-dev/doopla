import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — suíte de regressão do WhatsApp (13/10/2026). Cobre o
// caminho IMPURO de handleWhatsappInboundMessage com um Supabase fake
// mínimo (nunca toca banco/rede de verdade). Duas coisas que só dá pra
// provar aqui (não em intake-routing.test.ts, que é pura):
//
// 1) Regressão do bug real das 18h16 — duas mensagens consecutivas sem
//    identificar o profissional precisam gerar DUAS respostas via
//    WhatsApp, nunca silêncio na segunda em diante.
// 2) Colisão "doopla" (Cenário E) ponta a ponta — menção casual nunca
//    redireciona, mensagem que É só o código redireciona de verdade.
//
// Intelligence Core inteira (triggerInboundMessage/processInboundEvent)
// é mockada — este teste nunca a exercita, por design (não é escopo
// aqui, e evita qualquer custo/chamada real à OpenAI).

const sendWhatsappTextMessage = vi.fn();
const triggerInboundMessage = vi.fn();
const resolveOrCreateExternalParticipant = vi.fn();
const findReusableWhatsappConversation = vi.fn();

vi.mock('./client', () => ({
  sendWhatsappTextMessage: (...args: unknown[]) => sendWhatsappTextMessage(...args),
}));
vi.mock('@/lib/beta-integration/trigger', () => ({
  triggerInboundMessage: (...args: unknown[]) => triggerInboundMessage(...args),
}));
vi.mock('@/lib/runtime/intake', () => ({
  resolveOrCreateExternalParticipant: (...args: unknown[]) => resolveOrCreateExternalParticipant(...args),
}));
vi.mock('./conversation', () => ({
  findReusableWhatsappConversation: (...args: unknown[]) => findReusableWhatsappConversation(...args),
}));
vi.mock('@/lib/supabase/env', () => ({
  whatsappAccessToken: () => 'test-token',
  whatsappPhoneNumberId: () => 'test-phone-id',
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({}),
}));

type Resp = { data: unknown; error: unknown };

// Builder fake mínimo: cobre todo encadeamento usado em
// intake-orchestration.ts (select/eq/in/order/limit/returns são no-op,
// a resposta configurada só é consumida no fim — seja por
// maybeSingle()/single() ou por await direto do builder).
function makeBuilder(getResponse: () => Resp) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    returns: () => builder,
    maybeSingle: async () => getResponse(),
    single: async () => getResponse(),
    then: (resolve: (v: Resp) => void, reject: (e: unknown) => void) => Promise.resolve(getResponse()).then(resolve, reject),
  };
  return builder;
}

function queueResponder(responses: Resp[] | Resp) {
  const queue = Array.isArray(responses) ? [...responses] : null;
  return () => {
    if (queue) return queue.length > 1 ? queue.shift()! : queue[0];
    return responses as Resp;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createFakeSupabase(config: { from?: Record<string, Resp[] | Resp>; rpc?: Record<string, Resp[] | Resp> }): any {
  const fromResponders = Object.fromEntries(Object.entries(config.from ?? {}).map(([k, v]) => [k, queueResponder(v)]));
  const rpcResponders = Object.fromEntries(Object.entries(config.rpc ?? {}).map(([k, v]) => [k, queueResponder(v)]));

  return {
    from(table: string) {
      const responder = fromResponders[table];
      if (!responder) throw new Error(`fake supabase: tabela não configurada no teste: "${table}"`);
      return makeBuilder(responder);
    },
    rpc(fn: string) {
      const responder = rpcResponders[fn];
      if (!responder) throw new Error(`fake supabase: rpc não configurada no teste: "${fn}"`);
      return makeBuilder(responder);
    },
  };
}

const ok = (data: unknown): Resp => ({ data, error: null });
const EMPTY = ok([]);
const NONE = ok(null);

describe('handleWhatsappInboundMessage — regressão do silêncio (18h16, 13/10/2026)', () => {
  beforeEach(() => {
    sendWhatsappTextMessage.mockReset().mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.sys' });
    triggerInboundMessage.mockReset();
    resolveOrCreateExternalParticipant.mockReset();
    findReusableWhatsappConversation.mockReset();
  });

  it('duas mensagens consecutivas sem identificar o profissional: NUNCA fica em silêncio na segunda', async () => {
    const { handleWhatsappInboundMessage } = await import('./intake-orchestration');

    const supabase = createFakeSupabase({
      from: {
        professional_whatsapp_identities: NONE, // número nunca verificado
        artist_profiles: EMPTY, // nenhuma menção de nome bate
        profiles: EMPTY, // nenhum código bate
        external_participant_channel_identities: EMPTY, // sem histórico
        channel_inbound_intakes: [
          EMPTY, // 1ª mensagem: nenhuma sessão existente ainda
          ok([{ id: 'intake-1', attempt_count: 1, current_prompt_options: [] }]), // 2ª: sessão já existe, array VAZIO (o bug real)
        ],
        channel_inbound_intake_messages: ok([{ body: 'Olá, gostaria de saber sobre um orçamento.' }]), // backlog da 1ª msg
      },
      rpc: {
        claim_inbound_event: ok({ claimed: true, event_id: 'evt-1' }),
        claim_or_create_channel_inbound_intake: ok({ id: 'intake-1', attempt_count: 0, current_prompt_options: null }),
        append_channel_inbound_intake_message: ok({}),
        set_channel_inbound_intake_prompt: ok({}),
      },
    });

    const msg1 = await handleWhatsappInboundMessage(supabase, '+5511988887777', {
      providerMessageId: 'wamid.1',
      from: '5511988887777',
      body: 'Olá, gostaria de saber sobre um orçamento.',
      contactName: null,
      providerTimestampSeconds: null,
    });
    expect(msg1).toEqual({ kind: 'backlogged', intakeId: 'intake-1', promptSent: true });

    const msg2 = await handleWhatsappInboundMessage(supabase, '+5511988887777', {
      providerMessageId: 'wamid.2',
      from: '5511988887777',
      body: 'Tenho um evento dia 25/11 e quero um DJ tocando por três horas.',
      contactName: null,
      providerTimestampSeconds: null,
    });
    // Antes do fix: promptSent: false e NENHUM envio na 2ª mensagem.
    expect(msg2).toEqual({ kind: 'backlogged', intakeId: 'intake-1', promptSent: true });

    // A prova real da regressão: 2 mensagens do cliente -> 2 respostas
    // via WhatsApp, nunca 1 (silêncio na segunda).
    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(2);
  });
});

describe('handleWhatsappInboundMessage — retentativa de conversation_busy (P0, 14/10/2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendWhatsappTextMessage.mockReset();
    triggerInboundMessage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('conversation_busy na 1ª tentativa: espera e tenta de novo, mesma conversationId, nunca perde a mensagem', async () => {
    const { handleWhatsappInboundMessage } = await import('./intake-orchestration');

    triggerInboundMessage
      .mockResolvedValueOnce({ kind: 'conversation_busy' })
      .mockResolvedValueOnce({ kind: 'duplicate_event', alreadyProcessed: false });

    const supabase = createFakeSupabase({
      from: { professional_whatsapp_identities: ok({ professional_id: 'eduarda' }), profiles: EMPTY },
      rpc: { create_conversation: ok({ id: 'conv-self-continuo' }) },
    });

    const resultPromise = handleWhatsappInboundMessage(supabase, '+5511900000001', {
      providerMessageId: 'wamid.sim',
      from: '5511900000001',
      body: 'Sim',
      contactName: null,
      providerTimestampSeconds: null,
    });

    await vi.advanceTimersByTimeAsync(2000); // 1ª retentativa (2s)
    const result = await resultPromise;

    expect(result).toEqual({ kind: 'routed', conversationId: 'conv-self-continuo', method: 'verified_professional' });
    expect(triggerInboundMessage).toHaveBeenCalledTimes(2);
    // As duas tentativas usam o MESMO providerEventId — claim_inbound_event
    // (migration 0051) reclama de novo um evento 'failed', nunca cria
    // um segundo evento/duplicata.
    expect(triggerInboundMessage.mock.calls[0][0].providerEventId).toBe('wamid.sim');
    expect(triggerInboundMessage.mock.calls[1][0].providerEventId).toBe('wamid.sim');
  });

  it('conversation_busy persistente: desiste depois do teto de tentativas, nunca trava pra sempre', async () => {
    const { handleWhatsappInboundMessage } = await import('./intake-orchestration');

    triggerInboundMessage.mockResolvedValue({ kind: 'conversation_busy' });

    const supabase = createFakeSupabase({
      from: { professional_whatsapp_identities: ok({ professional_id: 'eduarda' }), profiles: EMPTY },
      rpc: { create_conversation: ok({ id: 'conv-self-continuo' }) },
    });

    const resultPromise = handleWhatsappInboundMessage(supabase, '+5511900000001', {
      providerMessageId: 'wamid.agora',
      from: '5511900000001',
      body: 'Agora',
      contactName: null,
      providerTimestampSeconds: null,
    });

    await vi.advanceTimersByTimeAsync(2000 + 4000);
    const result = await resultPromise;

    // Nunca lança/trava — devolve 'routed' mesmo sem confirmação de
    // sucesso do ciclo (o risco residual documentado: mensagem
    // extremamente próxima ainda pode não ser respondida a tempo).
    expect(result).toEqual({ kind: 'routed', conversationId: 'conv-self-continuo', method: 'verified_professional' });
    expect(triggerInboundMessage).toHaveBeenCalledTimes(3); // 1 original + 2 retentativas, nunca mais que isso
  });
});

describe('handleWhatsappInboundMessage — colisão "doopla" (Cenário E, 13/10/2026)', () => {
  beforeEach(() => {
    sendWhatsappTextMessage.mockReset().mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.sys' });
    triggerInboundMessage.mockReset().mockResolvedValue({ kind: 'noop' });
    resolveOrCreateExternalParticipant.mockReset().mockResolvedValue({ id: 'participant-1' });
    findReusableWhatsappConversation.mockReset().mockResolvedValue(null);
  });

  it('menção casual a "doopla" numa frase NUNCA redireciona para o profissional com esse código', async () => {
    const { handleWhatsappInboundMessage } = await import('./intake-orchestration');

    const supabase = createFakeSupabase({
      from: {
        professional_whatsapp_identities: ok({ professional_id: 'artist-b' }), // remetente é profissional verificada, OUTRA pessoa
        profiles: EMPTY, // nenhum candidato de código solto bate (doopla é excluída antes de chegar aqui)
      },
      rpc: {
        create_conversation: ok({ id: 'conv-self-1' }),
      },
    });

    const result = await handleWhatsappInboundMessage(supabase, '+5511900000001', {
      providerMessageId: 'wamid.casual',
      from: '5511900000001',
      body: 'oi doopla, tudo bem?',
      contactName: null,
      providerTimestampSeconds: null,
    });

    expect(result).toEqual({ kind: 'routed', conversationId: 'conv-self-1', method: 'verified_professional' });
    expect(triggerInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ authorType: 'professional', authorProfileId: 'artist-b' }));
  });

  it('mensagem que É só "doopla" (intenção explícita) redireciona pro profissional grandfathered com esse código', async () => {
    const { handleWhatsappInboundMessage } = await import('./intake-orchestration');

    const supabase = createFakeSupabase({
      from: {
        professional_whatsapp_identities: ok({ professional_id: 'artist-b' }), // remetente verificada, OUTRA pessoa
        profiles: ok({ id: 'eduarda', full_name: 'Eduarda Rios Leite' }), // 'doopla' é o slug dela
        artist_profiles: ok({ stage_name: null, public_enabled: true }),
      },
      rpc: {
        create_conversation: ok({ id: 'conv-ext-1' }),
      },
    });

    const result = await handleWhatsappInboundMessage(supabase, '+5511900000001', {
      providerMessageId: 'wamid.explicit',
      from: '5511900000001',
      body: 'doopla',
      contactName: null,
      providerTimestampSeconds: null,
    });

    expect(result).toEqual({ kind: 'routed', conversationId: 'conv-ext-1', method: 'token' });
    expect(triggerInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ authorType: 'external_participant' }));
  });
});
