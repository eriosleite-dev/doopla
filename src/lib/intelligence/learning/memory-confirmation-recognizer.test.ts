import { describe, expect, it } from 'vitest';

import { recognizeMemoryConfirmationReply, type MemoryConfirmationRecognizerModelCallResult } from './memory-confirmation-recognizer';

// Task #72 — fluxo de confirmação de memória. Mesma disciplina do
// resto do projeto: modelCall sempre injetado, nunca chama a OpenAI
// de verdade.

function fakeModelCall(parsed: MemoryConfirmationRecognizerModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('recognizeMemoryConfirmationReply', () => {
  it('"sim" é reconhecido como confirms', async () => {
    const result = await recognizeMemoryConfirmationReply('Sim, pode guardar.', { modelCall: fakeModelCall({ decision: 'confirms' }) });
    expect(result.decision).toBe('confirms');
  });

  it('"não, não é isso" é reconhecido como rejects', async () => {
    const result = await recognizeMemoryConfirmationReply('Não, não precisa anotar isso.', { modelCall: fakeModelCall({ decision: 'rejects' }) });
    expect(result.decision).toBe('rejects');
  });

  it('resposta que muda de assunto é ambiguous', async () => {
    const result = await recognizeMemoryConfirmationReply('Ah, aliás, me fala sobre o booking de sábado.', {
      modelCall: fakeModelCall({ decision: 'ambiguous' }),
    });
    expect(result.decision).toBe('ambiguous');
  });

  it('falha total do model (parsed=null) vira ambiguous, nunca lança', async () => {
    const result = await recognizeMemoryConfirmationReply('qualquer coisa', { modelCall: fakeModelCall(null), maxRetries: 0 });
    expect(result.decision).toBe('ambiguous');
  });

  it('exceção lançada pelo modelCall nunca escapa (engolida, mesmo padrão do resto do projeto)', async () => {
    const result = await recognizeMemoryConfirmationReply('qualquer coisa', {
      modelCall: async () => {
        throw new Error('falha de rede simulada');
      },
      maxRetries: 0,
    });
    expect(result.decision).toBe('ambiguous');
  });

  it('soma tokens de todas as tentativas, nunca só a última', async () => {
    let call = 0;
    const result = await recognizeMemoryConfirmationReply('Sim', {
      maxRetries: 2,
      modelCall: async () => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 100, outputTokens: 20 };
        return { parsed: { decision: 'confirms' as const }, inputTokens: 90, outputTokens: 18 };
      },
    });
    expect(result.inputTokens).toBe(100 + 90);
    expect(result.outputTokens).toBe(20 + 18);
  });
});
