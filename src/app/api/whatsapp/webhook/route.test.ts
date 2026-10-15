import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Doopla — Fase 1 (ADR 0002/0004, 15/10/2026): suíte de regressão da
// orquestração de duas passagens do webhook de WhatsApp (captura
// durável -> processamento best-effort). NextRequest/NextResponse
// funcionam fora do runtime real do Next.js (confirmado: são wrappers
// sobre a Fetch API padrão) — testa o handler real, não uma extração
// artificial só pra testabilidade.
//
// Intelligence Core inteira (handleWhatsappInboundMessage) é mockada —
// este teste cobre só a ORQUESTRAÇÃO (quando captura, quando reclama,
// quando marca completed/needs_attention, quando devolve 503), nunca
// o algoritmo de roteamento em si (coberto em intake-orchestration.test.ts).

const verifyWhatsappWebhookSignature = vi.fn();
const handleWhatsappInboundMessage = vi.fn();
const captureWhatsappInboundRawMessage = vi.fn();
const claimWhatsappInboundRawCaptureForProcessing = vi.fn();
const finishWhatsappInboundRawCapture = vi.fn();
const markOutboundIntentDelivered = vi.fn();
const markOutboundIntentRead = vi.fn();

vi.mock('@/lib/channels/whatsapp/webhook-verify', () => ({
  verifyWhatsappWebhookSignature: (...args: unknown[]) => verifyWhatsappWebhookSignature(...args),
  verifyWhatsappWebhookChallenge: vi.fn(),
}));
vi.mock('@/lib/supabase/env', () => ({
  whatsappAppSecret: () => 'test-secret',
  whatsappWebhookVerifyToken: () => 'test-verify-token',
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({}),
}));
vi.mock('@/lib/channels/whatsapp/intake-orchestration', () => ({
  handleWhatsappInboundMessage: (...args: unknown[]) => handleWhatsappInboundMessage(...args),
}));
vi.mock('@/lib/channels/whatsapp/raw-captures', () => ({
  captureWhatsappInboundRawMessage: (...args: unknown[]) => captureWhatsappInboundRawMessage(...args),
  claimWhatsappInboundRawCaptureForProcessing: (...args: unknown[]) => claimWhatsappInboundRawCaptureForProcessing(...args),
  finishWhatsappInboundRawCapture: (...args: unknown[]) => finishWhatsappInboundRawCapture(...args),
}));
vi.mock('@/lib/runtime', () => ({
  markOutboundIntentDelivered: (...args: unknown[]) => markOutboundIntentDelivered(...args),
  markOutboundIntentRead: (...args: unknown[]) => markOutboundIntentRead(...args),
}));

function makePostRequest(payload: unknown): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'x-hub-signature-256': 'sha256=valid', 'content-type': 'application/json' },
  });
}

function textMessagePayload(messages: Array<{ id: string; from: string; body: string }>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: messages.map((m) => ({ id: m.id, from: m.from, type: 'text', text: { body: m.body } })),
              contacts: [],
            },
          },
        ],
      },
    ],
  };
}

describe('POST /api/whatsapp/webhook — Fase 1, duas passagens', () => {
  beforeEach(() => {
    verifyWhatsappWebhookSignature.mockReset().mockReturnValue(true);
    handleWhatsappInboundMessage.mockReset();
    captureWhatsappInboundRawMessage.mockReset().mockResolvedValue({ id: 'capture-1', status: 'pending' });
    claimWhatsappInboundRawCaptureForProcessing.mockReset().mockResolvedValue({ claimed: true, captureId: 'capture-1', attemptCount: 1 });
    finishWhatsappInboundRawCapture.mockReset().mockResolvedValue(true);
    markOutboundIntentDelivered.mockReset();
    markOutboundIntentRead.mockReset();
  });

  it('captura bem-sucedida antes do roteamento, resultado routed -> completed, HTTP 200', async () => {
    const { POST } = await import('./route');
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'routed', conversationId: 'conv-1', method: 'token' });

    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi' }])));

    expect(res.status).toBe(200);
    expect(captureWhatsappInboundRawMessage).toHaveBeenCalledTimes(1);
    expect(captureWhatsappInboundRawMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ providerMessageId: 'wamid.1', body: 'Oi' }));
    // Captura ANTES do roteamento: handleWhatsappInboundMessage só roda
    // depois de capture+claim, nunca antes.
    expect(claimWhatsappInboundRawCaptureForProcessing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ providerMessageId: 'wamid.1' }));
    expect(handleWhatsappInboundMessage).toHaveBeenCalledTimes(1);
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerMessageId: 'wamid.1', status: 'completed', resultKind: 'routed' })
    );
  });

  it('falha de banco durante a captura -> 503, Passagem 2 NUNCA roda (nenhuma mensagem processada)', async () => {
    const { POST } = await import('./route');
    captureWhatsappInboundRawMessage.mockRejectedValue(new Error('conexão com o banco falhou'));

    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi' }])));

    expect(res.status).toBe(503);
    expect(claimWhatsappInboundRawCaptureForProcessing).not.toHaveBeenCalled();
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).not.toHaveBeenCalled();
  });

  it('lote com múltiplas mensagens, captura PARCIALMENTE concluída -> 503 pro lote inteiro, nenhuma mensagem processada (nem a que capturou OK)', async () => {
    const { POST } = await import('./route');
    captureWhatsappInboundRawMessage.mockImplementation(async (_supabase, params: { providerMessageId: string }) => {
      if (params.providerMessageId === 'wamid.2') throw new Error('falha simulada na 2ª captura');
      return { id: 'capture-ok', status: 'pending' };
    });

    const res = await POST(
      makePostRequest(
        textMessagePayload([
          { id: 'wamid.1', from: '5511988887777', body: 'Primeira' },
          { id: 'wamid.2', from: '5511988887778', body: 'Segunda' },
        ])
      )
    );

    expect(res.status).toBe(503);
    expect(captureWhatsappInboundRawMessage).toHaveBeenCalledTimes(2); // tenta capturar as duas, isolado por mensagem
    expect(claimWhatsappInboundRawCaptureForProcessing).not.toHaveBeenCalled(); // Passagem 2 nunca começa
  });

  it('reentrega do mesmo lote pela Meta (captura idempotente, claim já concluído) -> nunca reprocessa, HTTP 200', async () => {
    const { POST } = await import('./route');
    claimWhatsappInboundRawCaptureForProcessing.mockResolvedValue({ claimed: false, captureId: null, attemptCount: null });

    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi de novo' }])));

    expect(res.status).toBe(200);
    expect(captureWhatsappInboundRawMessage).toHaveBeenCalledTimes(1); // captura sempre tenta (idempotente no banco via ON CONFLICT)
    expect(claimWhatsappInboundRawCaptureForProcessing).toHaveBeenCalledTimes(1);
    // claim=false: nunca processa de novo, nunca chama finish (nada a finalizar).
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).not.toHaveBeenCalled();
  });

  it('concorrência entre workers (claim perdido, lease viva em outra entrega) -> nunca processa em paralelo', async () => {
    const { POST } = await import('./route');
    claimWhatsappInboundRawCaptureForProcessing.mockResolvedValue({ claimed: false, captureId: null, attemptCount: null });

    await POST(makePostRequest(textMessagePayload([{ id: 'wamid.concorrente', from: '5511988887777', body: 'Mensagem em voo' }])));

    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
  });

  it('falha DEPOIS da captura e claim, DURANTE o processamento (exceção) -> needs_attention, nunca completed, HTTP ainda 200', async () => {
    const { POST } = await import('./route');
    handleWhatsappInboundMessage.mockRejectedValue(new Error('falha inesperada no Runtime'));

    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi' }])));

    expect(res.status).toBe(200); // Passagem 2 nunca afeta o status HTTP
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerMessageId: 'wamid.1', status: 'needs_attention', error: expect.stringContaining('falha inesperada no Runtime') })
    );
  });

  it.each([
    ['routed', { kind: 'routed', conversationId: 'c1', method: 'token' }],
    ['duplicate_event', { kind: 'duplicate_event' }],
    ['backlogged', { kind: 'backlogged', intakeId: 'i1', promptSent: true }],
    ['abandoned', { kind: 'abandoned', intakeId: 'i1' }],
    ['deferred', { kind: 'deferred', conversationId: 'c1' }],
  ])('resultado "%s" tem evidência durável verificada em outro lugar -> completed', async (_label, result) => {
    const { POST } = await import('./route');
    handleWhatsappInboundMessage.mockResolvedValue(result);

    await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi' }])));

    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'completed', resultKind: result.kind }));
  });

  it('telefone inválido NUNCA é otimisticamente completed — fica needs_attention (nunca teve destino durável antes da Fase 1)', async () => {
    const { POST } = await import('./route');
    // "from" vazio depois de normalizado -> normalizeWhatsappPhone real devolve null.
    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '123', body: 'Oi' }])));

    expect(res.status).toBe(200);
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled(); // nunca chega a resolver identidade com telefone inválido
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'needs_attention', resultKind: 'invalid_phone' }));
  });

  it('mensagem não-texto (ex.: áudio) nunca é capturada nem processada — fora do escopo desta rodada, comportamento inalterado', async () => {
    const { POST } = await import('./route');
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: 'wamid.audio', from: '5511988887777', type: 'audio' }], contacts: [] } }] }],
    };

    const res = await POST(makePostRequest(payload));

    expect(res.status).toBe(200);
    expect(captureWhatsappInboundRawMessage).not.toHaveBeenCalled();
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
  });

  it('assinatura inválida -> 401, nunca chega a capturar nada', async () => {
    const { POST } = await import('./route');
    verifyWhatsappWebhookSignature.mockReturnValue(false);

    const res = await POST(makePostRequest(textMessagePayload([{ id: 'wamid.1', from: '5511988887777', body: 'Oi' }])));

    expect(res.status).toBe(401);
    expect(captureWhatsappInboundRawMessage).not.toHaveBeenCalled();
  });
});
