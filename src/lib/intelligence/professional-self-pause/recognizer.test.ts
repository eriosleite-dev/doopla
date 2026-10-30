import { describe, expect, it } from 'vitest';

import { recognizeProfessionalSelfPauseRequest, type ProfessionalSelfPauseRecognizerModelCallResult } from './recognizer';

// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008).
// Mesma disciplina de delegated-contact/recognizer.test.ts: modelCall
// sempre injetado, nunca chama a OpenAI de verdade.

function fakeModelCall(parsed: ProfessionalSelfPauseRecognizerModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('recognizeProfessionalSelfPauseRequest', () => {
  it('reconhece um pedido direto de pausa', async () => {
    const result = await recognizeProfessionalSelfPauseRequest('Pare de me escrever.', { modelCall: fakeModelCall({ signal: 'pause_requested' }) });
    expect(result.signal).toBe('pause_requested');
  });

  it('reconhece um pedido indireto, pelo sentido (nunca por lista de frases)', async () => {
    const result = await recognizeProfessionalSelfPauseRequest('já chega, pode parar', { modelCall: fakeModelCall({ signal: 'pause_requested' }) });
    expect(result.signal).toBe('pause_requested');
  });

  it('mensagem comum (pergunta normal) -> no_signal', async () => {
    const result = await recognizeProfessionalSelfPauseRequest('quanto cobro por um casamento de 4h?', { modelCall: fakeModelCall({ signal: 'no_signal' }) });
    expect(result.signal).toBe('no_signal');
  });

  it('falha TOTAL do model -> signal null (NUNCA no_signal, nunca pause_requested)', async () => {
    const result = await recognizeProfessionalSelfPauseRequest('oi', {
      modelCall: async () => ({ parsed: null, inputTokens: null, outputTokens: null }),
      maxRetries: 0,
    });
    expect(result.signal).toBeNull();
  });

  it('exceção lançada pelo modelCall -> signal null, nunca derruba o chamador', async () => {
    const result = await recognizeProfessionalSelfPauseRequest('oi', {
      modelCall: async () => {
        throw new Error('timeout simulado');
      },
      maxRetries: 0,
    });
    expect(result.signal).toBeNull();
  });

  it('soma tokens de tentativas anteriores já cobradas, nunca subconta', async () => {
    let calls = 0;
    const result = await recognizeProfessionalSelfPauseRequest('oi', {
      modelCall: async () => {
        calls += 1;
        if (calls === 1) return { parsed: null, inputTokens: 7, outputTokens: 3 };
        return { parsed: { signal: 'no_signal' }, inputTokens: 5, outputTokens: 2 };
      },
      maxRetries: 1,
    });
    expect(result.signal).toBe('no_signal');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(5);
  });
});
