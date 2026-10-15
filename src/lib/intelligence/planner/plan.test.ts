import { describe, expect, it } from 'vitest';

import type { ContextPackage } from '../context-builder';
import type { IntentClassification } from '../classification';
import type { ToolContext } from '../types';
import { planResponse, type PlannerModelCallResult } from './plan';

// Doopla — Head of AI (15/10/2026): mesmo achado/mesmo teste de
// classification/classify.test.ts (retry sobrescrevia inputTokens/
// outputTokens em vez de somar). modelCall sempre injetado, nunca
// chama a OpenAI de verdade.

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

const CLASSIFICATION: IntentClassification = {
  classificationStatus: 'classified',
  primaryIntent: 'orcamento',
  secondaryIntents: [],
  modelConfidence: 'high',
  effectiveConfidence: 'high',
  contextCompleteness: 'partial_unavailable',
  relevantCompetencies: [],
};

describe('planResponse — contagem de tokens sob retry', () => {
  it('soma os tokens de TODAS as tentativas, nunca só a última (achado real, 15/10/2026)', async () => {
    let call = 0;
    const result = await planResponse(TOOL_CTX, CONTEXT_PACKAGE, CLASSIFICATION, {
      maxRetries: 2,
      modelCall: async (): Promise<PlannerModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 400, outputTokens: 60 };
        if (call === 2) return { parsed: null, inputTokens: 380, outputTokens: 55 };
        return {
          parsed: {
            responsePlan: 'clarify_ambiguity',
            commitmentNature: 'not_applicable',
            proposedDecisionCategory: [],
            missingInformation: [],
            evidenceUsed: [],
            professionalDecisionSignal: 'none',
            proposedResponse: 'Pode me dar mais detalhes?',
          },
          inputTokens: 360,
          outputTokens: 50,
        };
      },
    });
    expect(result.inputTokens).toBe(400 + 380 + 360);
    expect(result.outputTokens).toBe(60 + 55 + 50);
  });

  it('todas as tentativas falham sem nunca devolver tokens -> permanece null (fallback fixo, nunca lança)', async () => {
    const result = await planResponse(TOOL_CTX, CONTEXT_PACKAGE, CLASSIFICATION, {
      maxRetries: 1,
      modelCall: async (): Promise<PlannerModelCallResult> => {
        throw new Error('sempre falha');
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    // Fallback fixo documentado em plan.ts: consult_professional + revisão obrigatória.
    expect(result.decision.responsePlan).toBe('consult_professional');
  });
});
