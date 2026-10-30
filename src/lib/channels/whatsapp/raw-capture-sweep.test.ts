import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — Fase 2 (ADR 0002, seção 12, 15/10/2026): suíte de
// regressão da ORQUESTRAÇÃO do sweep de recuperação. Intelligence
// Core (handleWhatsappInboundMessage) e a pré-checagem de roteamento
// são mockadas — este teste cobre só as decisões do sweep (quando
// retoma, quando bloqueia por ambiguidade, quando respeita backoff),
// nunca o algoritmo de roteamento em si.

const claimWhatsappInboundRawCaptureForProcessing = vi.fn();
const finishWhatsappInboundRawCapture = vi.fn();
const listWhatsappInboundRawCapturesForSweep = vi.fn();
const handleWhatsappInboundMessage = vi.fn();
const evaluateWhatsappInboundRoutingSafety = vi.fn();

vi.mock('./raw-captures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./raw-captures')>();
  return {
    ...actual,
    claimWhatsappInboundRawCaptureForProcessing: (...args: unknown[]) => claimWhatsappInboundRawCaptureForProcessing(...args),
    finishWhatsappInboundRawCapture: (...args: unknown[]) => finishWhatsappInboundRawCapture(...args),
    listWhatsappInboundRawCapturesForSweep: (...args: unknown[]) => listWhatsappInboundRawCapturesForSweep(...args),
  };
});
vi.mock('./intake-orchestration', () => ({
  handleWhatsappInboundMessage: (...args: unknown[]) => handleWhatsappInboundMessage(...args),
  evaluateWhatsappInboundRoutingSafety: (...args: unknown[]) => evaluateWhatsappInboundRoutingSafety(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSupabase = {} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCapture(overrides: Record<string, any> = {}) {
  return {
    id: 'capture-1',
    providerMessageId: 'wamid.sweep1',
    fromPhone: '+5511988887777',
    body: 'Oi, preciso de ajuda',
    contactName: 'Cliente Teste',
    providerTimestampSeconds: null,
    status: 'pending',
    resultKind: null,
    attemptCount: 0,
    capturedAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('sweepOneWhatsappInboundRawCapture', () => {
  beforeEach(() => {
    claimWhatsappInboundRawCaptureForProcessing.mockReset().mockResolvedValue({ claimed: true, captureId: 'capture-1', attemptCount: 1 });
    finishWhatsappInboundRawCapture.mockReset().mockResolvedValue(true);
    handleWhatsappInboundMessage.mockReset();
    evaluateWhatsappInboundRoutingSafety.mockReset().mockResolvedValue({ safe: true });
  });

  it('identidade determinística + claim ganho -> retoma de verdade e classifica completed', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'routed', conversationId: 'c1', method: 'token' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('resumed_completed');
    expect(evaluateWhatsappInboundRoutingSafety).toHaveBeenCalledWith({}, '+5511988887777', 'Oi, preciso de ajuda');
    expect(handleWhatsappInboundMessage).toHaveBeenCalledTimes(1);
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ providerMessageId: 'wamid.sweep1', status: 'completed', resultKind: 'routed' }));
  });

  it('resultado deferred -> resumed_delegated (nunca completed, mesma classificação do webhook)', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'deferred', conversationId: 'c1' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('resumed_delegated');
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'delegated', resultKind: 'deferred' }));
  });

  it('identidade AMBÍGUA (pré-checagem) -> nunca chama handleWhatsappInboundMessage, bloqueia com ambiguous_retry_blocked', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    evaluateWhatsappInboundRoutingSafety.mockResolvedValue({ safe: false, reason: 'ambiguous' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('blocked_at_precheck');
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', resultKind: 'ambiguous_retry_blocked' }));
  });

  // Achado real da revisão do Head of AI (15/10/2026): sendProfessionalSelfReplyViaWhatsapp
  // (pipeline.ts) é um envio direto ao WhatsApp do profissional, fora
  // de outbound_intents, sem idempotência própria — a pré-checagem
  // precisa bloquear o caminho professional_self tanto quanto o
  // ambíguo, nunca só este último.
  it('identidade verificada (professional_self) -> nunca chama handleWhatsappInboundMessage, bloqueia com professional_self_retry_blocked', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    evaluateWhatsappInboundRoutingSafety.mockResolvedValue({ safe: false, reason: 'professional_self_unproven' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('blocked_at_precheck');
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', resultKind: 'professional_self_retry_blocked' }));
  });

  // TOCTOU: a pré-checagem previu "seguro", mas a execução REAL (que
  // reavalia a decisão de verdade, com onlyProvenIdempotentPaths=true)
  // encontra um caminho sem idempotência comprovada — identidade/
  // histórico/sessão mudaram entre a seleção e a execução. O GATE REAL
  // dentro de handleWhatsappInboundMessage é quem evita o envio aqui,
  // não a pré-checagem (que já disse "pode ir").
  it('pré-checagem diz seguro, mas a execução real diverge (retry_blocked) -> blocked_at_execution, nunca um envio', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    evaluateWhatsappInboundRoutingSafety.mockResolvedValue({ safe: true });
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'retry_blocked', reason: 'ambiguous_identity' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('blocked_at_execution');
    expect(handleWhatsappInboundMessage).toHaveBeenCalledWith(fakeSupabase, expect.anything(), expect.anything(), { onlyProvenIdempotentPaths: true });
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', resultKind: 'ambiguous_retry_blocked' }));
  });

  it('pré-checagem diz seguro, execução real diverge pra professional_self_unproven -> blocked_at_execution', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    evaluateWhatsappInboundRoutingSafety.mockResolvedValue({ safe: true });
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'retry_blocked', reason: 'professional_self_unproven' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('blocked_at_execution');
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', resultKind: 'professional_self_retry_blocked' }));
  });

  it('claim perdido (outra entrega/tick já reclamou) -> claim_missed, nunca processa, nunca finaliza', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    claimWhatsappInboundRawCaptureForProcessing.mockResolvedValue({ claimed: false, captureId: null, attemptCount: null });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('claim_missed');
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).not.toHaveBeenCalled();
  });

  it('exceção durante handleWhatsappInboundMessage -> needs_attention, resumed_failed', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    handleWhatsappInboundMessage.mockRejectedValue(new Error('falha simulada'));

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture());

    expect(outcome).toBe('resumed_failed');
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', error: expect.stringContaining('falha simulada') }));
  });

  it('sem telefone/corpo (defesa em profundidade) -> invalid_phone, nunca chama a pré-checagem nem o processamento', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, makeCapture({ fromPhone: null, body: null }));

    expect(outcome).toBe('invalid_phone');
    expect(evaluateWhatsappInboundRoutingSafety).not.toHaveBeenCalled();
    expect(handleWhatsappInboundMessage).not.toHaveBeenCalled();
    expect(finishWhatsappInboundRawCapture).toHaveBeenCalledWith({}, expect.objectContaining({ status: 'needs_attention', resultKind: 'invalid_phone' }));
  });

  it('pending nunca respeita backoff (nada falhou ainda) — sempre elegível', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'routed', conversationId: 'c1', method: 'token' });
    const capturedAgoraMesmo = makeCapture({ status: 'pending', updatedAt: new Date().toISOString() });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, capturedAgoraMesmo, new Date());

    expect(outcome).toBe('resumed_completed');
  });

  it('needs_attention com backoff AINDA NÃO vencido -> backoff_not_due, nunca tenta', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    const now = new Date('2026-10-15T10:00:10.000Z'); // 10s depois do updatedAt — backoff de attempt 1 é 30s
    const capture = makeCapture({ status: 'needs_attention', attemptCount: 1, updatedAt: '2026-10-15T10:00:00.000Z' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, capture, now);

    expect(outcome).toBe('backoff_not_due');
    expect(claimWhatsappInboundRawCaptureForProcessing).not.toHaveBeenCalled();
    expect(evaluateWhatsappInboundRoutingSafety).not.toHaveBeenCalled();
  });

  it('needs_attention com backoff JÁ vencido -> tenta normalmente', async () => {
    const { sweepOneWhatsappInboundRawCapture } = await import('./raw-capture-sweep');
    handleWhatsappInboundMessage.mockResolvedValue({ kind: 'routed', conversationId: 'c1', method: 'token' });
    const now = new Date('2026-10-15T10:00:31.000Z'); // 31s depois — backoff de attempt 1 (30s) já venceu
    const capture = makeCapture({ status: 'needs_attention', attemptCount: 1, updatedAt: '2026-10-15T10:00:00.000Z' });

    const outcome = await sweepOneWhatsappInboundRawCapture(fakeSupabase, capture, now);

    expect(outcome).toBe('resumed_completed');
  });
});

describe('runWhatsappInboundRawCaptureSweep', () => {
  beforeEach(() => {
    claimWhatsappInboundRawCaptureForProcessing.mockReset().mockResolvedValue({ claimed: true, captureId: 'x', attemptCount: 1 });
    finishWhatsappInboundRawCapture.mockReset().mockResolvedValue(true);
    handleWhatsappInboundMessage.mockReset().mockResolvedValue({ kind: 'routed', conversationId: 'c1', method: 'token' });
    evaluateWhatsappInboundRoutingSafety.mockReset().mockResolvedValue({ safe: true });
    listWhatsappInboundRawCapturesForSweep.mockReset();
  });

  it('soma o tally corretamente e continua o loop mesmo se UMA captura lançar inesperadamente', async () => {
    const { runWhatsappInboundRawCaptureSweep } = await import('./raw-capture-sweep');
    listWhatsappInboundRawCapturesForSweep.mockResolvedValue([
      makeCapture({ providerMessageId: 'wamid.a' }),
      makeCapture({ providerMessageId: 'wamid.b' }),
      makeCapture({ providerMessageId: 'wamid.c' }),
    ]);
    // 2ª captura: claim lança uma exceção NÃO tratada (ex.: erro de
    // rede real) — nunca derruba o sweep inteiro, mesmo princípio de
    // isolamento de falha do webhook.
    claimWhatsappInboundRawCaptureForProcessing
      .mockResolvedValueOnce({ claimed: true, captureId: 'a', attemptCount: 1 })
      .mockRejectedValueOnce(new Error('falha de rede simulada'))
      .mockResolvedValueOnce({ claimed: true, captureId: 'c', attemptCount: 1 });

    const tally = await runWhatsappInboundRawCaptureSweep(fakeSupabase, { limit: 10 });

    expect(tally.resumed_completed).toBe(2); // a e c
    expect(listWhatsappInboundRawCapturesForSweep).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 10 }));
  });

  it('lista com maxAttempts default (RAW_CAPTURE_SWEEP_MAX_ATTEMPTS) quando não especificado', async () => {
    const { runWhatsappInboundRawCaptureSweep, RAW_CAPTURE_SWEEP_MAX_ATTEMPTS } = await import('./raw-capture-sweep');
    listWhatsappInboundRawCapturesForSweep.mockResolvedValue([]);

    await runWhatsappInboundRawCaptureSweep(fakeSupabase);

    expect(listWhatsappInboundRawCapturesForSweep).toHaveBeenCalledWith({}, expect.objectContaining({ maxAttempts: RAW_CAPTURE_SWEEP_MAX_ATTEMPTS }));
  });
});
