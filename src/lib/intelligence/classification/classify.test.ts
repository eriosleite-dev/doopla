import { describe, expect, it } from 'vitest';

import type { ContextPackage } from '../context-builder';
import type { ToolContext } from '../types';
import { classifyIntent, type ClassifierModelCallResult } from './classify';

// Doopla — Head of AI (15/10/2026): mesmo achado/mesmo teste de
// policy-gate-post/extractor.test.ts (retry sobrescrevia inputTokens/
// outputTokens em vez de somar, subcontando o custo real de
// tentativas que falharam mas ainda assim foram cobradas pela
// OpenAI). modelCall sempre injetado, nunca chama a OpenAI de
// verdade. Fixtures mínimas, só o suficiente pra classifyIntent rodar
// (todas as seções do ContextPackage podem legitimamente estar
// 'unavailable' — estado real e esperado, nunca um atalho de teste).

const TOOL_CTX: ToolContext = {
  representedProfessionalId: 'prof-1',
  actorContext: {
    representedProfessionalId: 'prof-1',
    actorType: 'professional',
    actorProfileId: 'prof-1',
    capabilities: [],
    triggerSource: 'dev_test_panel',
  },
  conversation: {
    id: 'conv-1',
    represented_professional_id: 'prof-1',
    mandate: 'active',
    status: 'active',
    current_state: 'active',
    conversation_type: 'external_inquiry',
    external_participant_id: 'ep-1',
    related_opportunity_id: null,
    related_booking_id: null,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: {} as any,
};

const CONTEXT_PACKAGE: ContextPackage = {
  conversationId: 'conv-1',
  representedProfessionalId: 'prof-1',
  builtAt: '2026-10-15T12:00:00Z',
  professional: { status: 'unavailable' },
  professionalBusinessContext: { status: 'unavailable' },
  professionalCommercialHistory: { status: 'unavailable' },
  messages: { status: 'unavailable' },
  opportunity: { status: 'unavailable' },
  booking: { status: 'unavailable' },
  externalParticipant: { status: 'unavailable' },
};

describe('classifyIntent — contagem de tokens sob retry', () => {
  it('soma os tokens de TODAS as tentativas, nunca só a última (achado real, 15/10/2026)', async () => {
    let call = 0;
    const result = await classifyIntent(TOOL_CTX, CONTEXT_PACKAGE, {
      maxRetries: 2,
      modelCall: async (): Promise<ClassifierModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 300, outputTokens: 50 };
        if (call === 2) return { parsed: null, inputTokens: 280, outputTokens: 45 };
        return { parsed: { classificationStatus: 'classified', primaryIntent: 'orcamento', secondaryIntents: [], modelConfidence: 'high' }, inputTokens: 260, outputTokens: 40 };
      },
    });
    expect(result.inputTokens).toBe(300 + 280 + 260);
    expect(result.outputTokens).toBe(50 + 45 + 40);
  });

  it('todas as tentativas falham sem nunca devolver tokens -> permanece null (fallback determinístico, nunca lança)', async () => {
    const result = await classifyIntent(TOOL_CTX, CONTEXT_PACKAGE, {
      maxRetries: 1,
      modelCall: async (): Promise<ClassifierModelCallResult> => {
        throw new Error('sempre falha');
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.classification.classificationStatus).toBe('invalid');
  });
});
