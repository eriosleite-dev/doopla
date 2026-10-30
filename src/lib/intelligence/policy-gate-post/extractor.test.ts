import { describe, expect, it } from 'vitest';

import { extractCommitments, type PolicyGateExtractorModelCallResult } from './extractor';

// Doopla — Head of AI (15/10/2026): teste focado no achado real de
// auditoria (retry sobrescrevia inputTokens/outputTokens em vez de
// somar, subcontando o custo real de tentativas que falharam mas
// ainda assim foram cobradas pela OpenAI). modelCall sempre injetado,
// nunca chama a OpenAI de verdade.

const TEMPORAL = { referenceTimestamp: '2026-10-15T12:00:00Z', timezone: null, knownEventDate: null };

describe('extractCommitments — contagem de tokens sob retry', () => {
  it('soma os tokens de TODAS as tentativas, nunca só a última (achado real, 15/10/2026)', async () => {
    let call = 0;
    const result = await extractCommitments('texto qualquer', TEMPORAL, {
      maxRetries: 2,
      modelCall: async (): Promise<PolicyGateExtractorModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 100, outputTokens: 20 }; // falha de parse, mas consumiu tokens de verdade
        if (call === 2) return { parsed: null, inputTokens: 90, outputTokens: 15 }; // falha de novo
        return { parsed: { commitments: [] }, inputTokens: 80, outputTokens: 10 }; // sucesso na 3ª
      },
    });
    expect(result.inputTokens).toBe(100 + 90 + 80);
    expect(result.outputTokens).toBe(20 + 15 + 10);
    expect(result.unavailable).toBe(false);
  });

  it('exceção numa tentativa (sem tokens) nunca quebra a soma das tentativas vizinhas que tiveram tokens', async () => {
    let call = 0;
    const result = await extractCommitments('texto qualquer', TEMPORAL, {
      maxRetries: 1,
      modelCall: async (): Promise<PolicyGateExtractorModelCallResult> => {
        call++;
        if (call === 1) throw new Error('timeout de rede — nunca retorna tokens');
        return { parsed: { commitments: [] }, inputTokens: 50, outputTokens: 5 };
      },
    });
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(5);
  });

  it('todas as tentativas falham sem nunca devolver tokens -> permanece null (nunca inventa um 0)', async () => {
    const result = await extractCommitments('texto qualquer', TEMPORAL, {
      maxRetries: 1,
      modelCall: async (): Promise<PolicyGateExtractorModelCallResult> => {
        throw new Error('sempre falha');
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.unavailable).toBe(true);
  });

  it('única tentativa bem-sucedida: soma é igual ao valor único (comportamento preservado)', async () => {
    const result = await extractCommitments('texto qualquer', TEMPORAL, {
      maxRetries: 0,
      modelCall: async (): Promise<PolicyGateExtractorModelCallResult> => ({ parsed: { commitments: [] }, inputTokens: 42, outputTokens: 7 }),
    });
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(7);
  });
});
