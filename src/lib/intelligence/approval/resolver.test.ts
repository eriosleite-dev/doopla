import { describe, expect, it } from 'vitest';

import { resolveApproval } from './resolver';
import type { ResolutionContextV1 } from './canonicalize';
import type { ApprovalResolverModelCallResult } from './resolver';

// Doopla — Head of AI (15/10/2026): mesmo achado/mesmo teste de
// extractor.test.ts (retry sobrescrevia inputTokens/outputTokens em
// vez de somar). modelCall sempre injetado, nunca chama a OpenAI de
// verdade.

const MINIMAL_CONTEXT: ResolutionContextV1 = {
  contextSchemaVersion: 'v1',
  professionalId: 'prof-1',
  commercialRootId: 'root-1',
  messageWindow: [],
  activeApprovalCandidates: [],
  communicatedProposalCandidates: [],
  structuralFacts: {},
  messageContents: [],
};

describe('resolveApproval — contagem de tokens sob retry', () => {
  it('soma os tokens de TODAS as tentativas, nunca só a última (achado real, 15/10/2026)', async () => {
    let call = 0;
    const result = await resolveApproval(MINIMAL_CONTEXT, {
      maxRetries: 2,
      modelCall: async (): Promise<ApprovalResolverModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 200, outputTokens: 40 };
        if (call === 2) return { parsed: null, inputTokens: 180, outputTokens: 35 };
        return { parsed: { outcome: 'inconclusive', decisions: [], inconclusiveReason: 'model_ambiguous' }, inputTokens: 150, outputTokens: 20 };
      },
    });
    expect(result.inputTokens).toBe(200 + 180 + 150);
    expect(result.outputTokens).toBe(40 + 35 + 20);
  });

  it('todas as tentativas falham sem nunca devolver tokens -> permanece null', async () => {
    const result = await resolveApproval(MINIMAL_CONTEXT, {
      maxRetries: 1,
      modelCall: async (): Promise<ApprovalResolverModelCallResult> => {
        throw new Error('sempre falha');
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    // Falha total -> fail-closed, nunca "resolved" por default.
    expect(result.output.outcome).toBe('inconclusive');
  });
});
