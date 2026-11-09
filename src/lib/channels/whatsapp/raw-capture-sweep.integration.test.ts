import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — Fase 2 (ADR 0002, achado real da revisão do Head of AI,
// 15/10/2026): teste INTEGRADO, atravessando seleção -> claim ->
// pré-checagem -> processamento real -> estado final, sem mockar
// intake-orchestration.ts nem raw-captures.ts (o que todos os outros
// testes desta suíte fazem) — só os limites externos reais (envio de
// WhatsApp, pipeline do Runtime, fila de professional_self), mesmo
// padrão de intake-orchestration.test.ts. Prova que o GATE REAL (não
// só a pré-checagem, não só mocks isolados) funciona quando tudo roda
// junto, com uma mudança de roteamento SIMULADA entre a pré-checagem e
// a execução.

const sendWhatsappTextMessage = vi.fn();
const triggerInboundMessage = vi.fn();
const resolveOrCreateExternalParticipant = vi.fn();
const findReusableWhatsappConversation = vi.fn();
const enqueueProfessionalSelfPendingMessage = vi.fn();
const drainProfessionalSelfPendingMessages = vi.fn();

vi.mock('./client', () => ({
  sendWhatsappTextMessage: (...args: unknown[]) => sendWhatsappTextMessage(...args),
}));
vi.mock('@/lib/beta-integration/trigger', () => ({
  triggerInboundMessage: (...args: unknown[]) => triggerInboundMessage(...args),
}));
vi.mock('@/lib/runtime/professional-self-pending-messages', () => ({
  enqueueProfessionalSelfPendingMessage: (...args: unknown[]) => enqueueProfessionalSelfPendingMessage(...args),
  drainProfessionalSelfPendingMessages: (...args: unknown[]) => drainProfessionalSelfPendingMessages(...args),
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

type Resp = { data: unknown; error: unknown };

// Mesmo builder fake mínimo de intake-orchestration.test.ts — propositalmente
// duplicado aqui (não exportado de lá), cada suíte de teste mantém sua
// própria infra, mesmo padrão já usado no projeto (ex.:
// professional-self-pending-messages.test.ts tem a sua própria).
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

describe('sweep integrado — captura -> seleção -> claim -> pré-checagem -> processamento -> estado final (Fase 2, 15/10/2026)', () => {
  beforeEach(() => {
    sendWhatsappTextMessage.mockReset().mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.sys' });
    triggerInboundMessage.mockReset();
    resolveOrCreateExternalParticipant.mockReset();
    findReusableWhatsappConversation.mockReset();
    enqueueProfessionalSelfPendingMessage.mockReset();
    drainProfessionalSelfPendingMessages.mockReset();
  });

  it('cenário feliz: pending -> seleção -> claim -> pré-checagem segura -> processamento real -> completed', async () => {
    const { runWhatsappInboundRawCaptureSweep } = await import('./raw-capture-sweep');

    const capturedRow = {
      id: 'capture-happy',
      provider_message_id: 'wamid.integ.happy',
      from_phone: '5511900000001',
      body: 'doopla',
      contact_name: 'Cliente Integrado',
      provider_timestamp_seconds: null,
      status: 'pending',
      result_kind: null,
      attempt_count: 0,
      captured_at: '2026-10-15T10:00:00.000Z',
      updated_at: '2026-10-15T10:00:00.000Z',
    };

    const supabase = createFakeSupabase({
      from: {
        professional_whatsapp_identities: NONE,
        profiles: ok({ id: 'eduarda', full_name: 'Eduarda Rios Leite' }),
        artist_profiles: [EMPTY, ok({ stage_name: null, public_enabled: true }), EMPTY, ok({ stage_name: null, public_enabled: true })],
        channel_inbound_intakes: EMPTY,
        external_participant_channel_identities: EMPTY,
      },
      rpc: {
        list_whatsapp_inbound_raw_captures_for_sweep: ok([capturedRow]),
        claim_whatsapp_inbound_raw_capture_for_processing: ok({ claimed: true, capture_id: 'capture-happy', attempt_count: 1 }),
        finish_whatsapp_inbound_raw_capture: ok(true),
        create_conversation: ok({ id: 'conv-integ-happy' }),
      },
    });
    triggerInboundMessage.mockResolvedValue({ kind: 'noop' });
    resolveOrCreateExternalParticipant.mockResolvedValue({ id: 'participant-integ' });
    findReusableWhatsappConversation.mockResolvedValue(null);

    const tally = await runWhatsappInboundRawCaptureSweep(supabase, { limit: 10 });

    expect(tally.resumed_completed).toBe(1);
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled(); // caminho determinístico, nenhum prompt de sistema
  });

  // O TESTE central do ponto 4: a sessão de intake muda entre a
  // pré-checagem (1ª leitura de channel_inbound_intakes, dentro de
  // evaluateWhatsappInboundRoutingSafety) e a execução real (2ª
  // leitura, dentro de handleWhatsappInboundMessage) — simula
  // exatamente o TOCTOU que a revisão do Head of AI pediu pra fechar.
  // Na pré-checagem, a sessão tem uma opção de prompt que a mensagem
  // responde (resolveria via client_confirmation, seguro). Na
  // execução, a MESMA sessão já não tem mais essa opção (mudou nesse
  // meio-tempo) — a decisão de verdade cai em no_signal/ambíguo, e o
  // GATE REAL precisa abortar ANTES de mandar qualquer coisa.
  it('divergência simulada entre pré-checagem e execução real: NUNCA envia, fica needs_attention/retry_blocked', async () => {
    const { runWhatsappInboundRawCaptureSweep } = await import('./raw-capture-sweep');

    const capturedRow = {
      id: 'capture-toctou',
      provider_message_id: 'wamid.integ.toctou',
      from_phone: '5511900000002',
      body: '1',
      contact_name: 'Cliente TOCTOU',
      provider_timestamp_seconds: null,
      status: 'pending',
      result_kind: null,
      attempt_count: 0,
      captured_at: '2026-10-15T10:00:00.000Z',
      updated_at: '2026-10-15T10:00:00.000Z',
    };

    const sessionComOpcaoQueRespondeAMensagem = ok([
      { id: 'intake-toctou', attempt_count: 1, current_prompt_options: [{ index: 1, professionalId: 'artist-x', label: 'Artist X' }] },
    ]);
    // Mesma sessão, mas as opções de prompt MUDARAM (ex.: outra
    // mensagem concorrente resolveu ou resetou a sessão) — "1" não
    // responde mais nada reconhecível.
    const mesmaSessaoComOpcoesDiferentes = ok([{ id: 'intake-toctou', attempt_count: 1, current_prompt_options: [] }]);

    const supabase = createFakeSupabase({
      from: {
        professional_whatsapp_identities: NONE,
        profiles: EMPTY,
        artist_profiles: EMPTY,
        external_participant_channel_identities: EMPTY,
        channel_inbound_intake_messages: EMPTY,
        // 1ª leitura (pré-checagem) -> sessão com opção válida.
        // 2ª leitura (execução real) -> MESMA sessão, opções vazias.
        channel_inbound_intakes: [sessionComOpcaoQueRespondeAMensagem, mesmaSessaoComOpcoesDiferentes],
      },
      rpc: {
        list_whatsapp_inbound_raw_captures_for_sweep: ok([capturedRow]),
        claim_whatsapp_inbound_raw_capture_for_processing: ok({ claimed: true, capture_id: 'capture-toctou', attempt_count: 1 }),
        finish_whatsapp_inbound_raw_capture: ok(true),
      },
    });

    const tally = await runWhatsappInboundRawCaptureSweep(supabase, { limit: 10 });

    // A prova mais forte possível: NENHUM envio de WhatsApp em nenhum
    // momento, apesar da divergência real entre o que a pré-checagem
    // previu e o que a execução encontrou.
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
    expect(triggerInboundMessage).not.toHaveBeenCalled();
    // A pré-checagem viu "seguro" (client_confirmation resolveria) —
    // então o bloqueio real aconteceu DENTRO da execução, não antes
    // dela (blocked_at_execution, nunca blocked_at_precheck).
    expect(tally.blocked_at_execution).toBe(1);
    expect(tally.blocked_at_precheck).toBe(0);
    expect(tally.resumed_completed).toBe(0);
  });
});
