import { describe, expect, it } from 'vitest';

import { detectInboundProposal, type InboundProposalModelCallResult } from './detector';

// Doopla — Head of AI (15/10/2026): mesmo achado/mesmo teste de
// extractor.test.ts (retry sobrescrevia inputTokens/outputTokens em
// vez de somar). modelCall sempre injetado, nunca chama a OpenAI de
// verdade.

const TEMPORAL = { referenceTimestamp: '2026-10-15T12:00:00Z', timezone: null, knownEventDate: null };

describe('detectInboundProposal — contagem de tokens sob retry', () => {
  it('soma os tokens de TODAS as tentativas, nunca só a última (achado real, 15/10/2026)', async () => {
    let call = 0;
    const result = await detectInboundProposal('texto qualquer', TEMPORAL, {
      maxRetries: 2,
      modelCall: async (): Promise<InboundProposalModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 60, outputTokens: 12 };
        if (call === 2) return { parsed: null, inputTokens: 55, outputTokens: 10 };
        return { parsed: { proposals: [] }, inputTokens: 50, outputTokens: 8 };
      },
    });
    expect(result.inputTokens).toBe(60 + 55 + 50);
    expect(result.outputTokens).toBe(12 + 10 + 8);
    expect(result.unavailable).toBe(false);
  });

  it('todas as tentativas falham sem nunca devolver tokens -> permanece null', async () => {
    const result = await detectInboundProposal('texto qualquer', TEMPORAL, {
      maxRetries: 1,
      modelCall: async (): Promise<InboundProposalModelCallResult> => {
        throw new Error('sempre falha');
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.unavailable).toBe(true);
  });
});
