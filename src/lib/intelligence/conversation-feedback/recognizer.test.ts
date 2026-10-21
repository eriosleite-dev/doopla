import { describe, expect, it } from 'vitest';

import { recognizeConversationFeedback, type ConversationFeedbackRecognizerModelCallResult } from './recognizer';

// ADR 0011 (20/10/2026) — Fase A. Mesma disciplina do resto do
// projeto: modelCall sempre injetado, nunca chama a OpenAI de verdade.

function fakeModelCall(parsed: ConversationFeedbackRecognizerModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('recognizeConversationFeedback', () => {
  it('reconhece feedback negativo direto', async () => {
    const result = await recognizeConversationFeedback('Erro', null, { modelCall: fakeModelCall({ signal: 'negative' }) });
    expect(result.signal).toBe('negative');
  });

  it('reconhece feedback negativo indireto, pelo sentido', async () => {
    const result = await recognizeConversationFeedback('Não foi isso que eu perguntei', 'Vou verificar o cachê disponível.', {
      modelCall: fakeModelCall({ signal: 'negative' }),
    });
    expect(result.signal).toBe('negative');
  });

  it('reconhece feedback positivo', async () => {
    const result = await recognizeConversationFeedback('Perfeito! Era exatamente isso', 'Já confirmei o show de sábado.', {
      modelCall: fakeModelCall({ signal: 'positive' }),
    });
    expect(result.signal).toBe('positive');
  });

  it('mensagem comum (pedido normal) -> no_signal', async () => {
    const result = await recognizeConversationFeedback('Manda uma mensagem pro cliente perguntando o endereço', null, {
      modelCall: fakeModelCall({ signal: 'no_signal' }),
    });
    expect(result.signal).toBe('no_signal');
  });

  it('falha TOTAL do model -> no_signal (nunca grava um feedback sem reconhecimento real)', async () => {
    const result = await recognizeConversationFeedback('oi', null, {
      modelCall: async () => ({ parsed: null, inputTokens: null, outputTokens: null }),
      maxRetries: 0,
    });
    expect(result.signal).toBe('no_signal');
  });

  it('exceção lançada pelo modelCall -> no_signal, nunca derruba o chamador', async () => {
    const result = await recognizeConversationFeedback('oi', null, {
      modelCall: async () => {
        throw new Error('timeout simulado');
      },
      maxRetries: 0,
    });
    expect(result.signal).toBe('no_signal');
  });

  it('soma tokens de tentativas anteriores já cobradas, nunca subconta', async () => {
    let calls = 0;
    const result = await recognizeConversationFeedback('oi', null, {
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
