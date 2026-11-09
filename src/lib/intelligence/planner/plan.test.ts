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
  conversationState: { status: 'not_allowed' },
  professionalBusinessContext: { status: 'unavailable' },
  professionalCommercialHistory: { status: 'unavailable' },
  professionalLearnedPreferences: { status: 'unavailable' },
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

// 'outro' nunca mandata nenhuma categoria de decisão (INTENT_MANDATORY_DECISION_CATEGORIES,
// decision-categories.ts) — usado nos testes do Mecanismo de não-repetição
// de pergunta (abaixo) pra isolar esse mecanismo do piso de decisão
// protegida já existente (que também força consult_professional, por
// um motivo diferente, pra intents como 'orcamento').
const CLASSIFICATION_NO_MANDATORY_DECISION: IntentClassification = {
  ...CLASSIFICATION,
  primaryIntent: 'outro',
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

describe('planResponse — Playbook DJ/Música chega de fato via Competence Router (ADR 0006, 16/10/2026)', () => {
  it('intent "orcamento" roteia comercial_negociacao -> instructions reais recebem o bloco do Playbook', async () => {
    let capturedInstructions = '';
    await planResponse(TOOL_CTX, CONTEXT_PACKAGE, CLASSIFICATION, {
      maxRetries: 0,
      modelCall: async ({ instructions }) => {
        capturedInstructions = instructions;
        return {
          parsed: {
            responsePlan: 'clarify_ambiguity',
            commitmentNature: 'not_applicable',
            proposedDecisionCategory: [],
            missingInformation: [],
            evidenceUsed: [],
            professionalDecisionSignal: 'none',
            proposedResponse: null,
          },
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    });
    expect(capturedInstructions).toMatch(/Playbook v1/);
  });

  it('intent "suporte" (sem competência comercial) -> instructions reais NUNCA recebem o bloco do Playbook', async () => {
    let capturedInstructions = '';
    const suporteClassification: IntentClassification = { ...CLASSIFICATION, primaryIntent: 'suporte' };
    await planResponse(TOOL_CTX, CONTEXT_PACKAGE, suporteClassification, {
      maxRetries: 0,
      modelCall: async ({ instructions }) => {
        capturedInstructions = instructions;
        return {
          parsed: {
            responsePlan: 'clarify_ambiguity',
            commitmentNature: 'not_applicable',
            proposedDecisionCategory: [],
            missingInformation: [],
            evidenceUsed: [],
            professionalDecisionSignal: 'none',
            proposedResponse: null,
          },
          inputTokens: 1,
          outputTokens: 1,
        };
      },
    });
    expect(capturedInstructions).not.toMatch(/Playbook v1/);
  });
});

describe('planResponse — fallback de consult_professional distingue interlocutor de ponta a ponta (achado da fundadora, 19/10/2026)', () => {
  // Fallback só entra quando há texto humano real no gatilho
  // (triggerHasUsableText, plan.ts) — CONTEXT_PACKAGE padrão deste
  // arquivo tem messages:'unavailable', então precisa de uma
  // mensagem real aqui pra exercitar o caminho de verdade.
  const CONTEXT_PACKAGE_WITH_TRIGGER: ContextPackage = {
    ...CONTEXT_PACKAGE,
    messages: {
      status: 'loaded',
      items: [
        {
          messageId: 'msg-1',
          createdAt: '2026-10-19T12:00:00Z',
          authorType: 'professional',
          direction: 'inbound',
          contentType: 'text',
          text: 'Quando é o show mesmo?',
          truncated: false,
          provenance: { sourceType: 'conversation_message', sourceId: 'msg-1' },
        },
      ],
      windowMessageCount: 1,
      windowSince: '2026-10-19T12:00:00Z',
    },
  };

  it('professional_self + piso rebaixa answer_with_known_information (sem evidência) -> fallback final nunca menciona "cliente"', async () => {
    const selfToolCtx: ToolContext = { ...TOOL_CTX, conversation: { ...TOOL_CTX.conversation, conversation_type: 'professional_self' } };
    const result = await planResponse(selfToolCtx, CONTEXT_PACKAGE_WITH_TRIGGER, CLASSIFICATION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'answer_with_known_information',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          // Sem evidenceUsed -> resolveResponsePlan rebaixa pra
          // consult_professional (invariants.ts) -> draft descartado
          // (draftStillValid=false) -> fallback determinístico entra.
          missingInformation: [{ field: 'data exata do show', reason: 'not_yet_provided', blocksProfessionalDecision: true }],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'Rascunho que será descartado porque o plano mudou.',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('consult_professional');
    expect(result.decision.proposedResponse).not.toBeNull();
    expect(result.decision.proposedResponse?.toLowerCase()).not.toMatch(/cliente/);
    expect(result.decision.proposedResponse).not.toMatch(/Rascunho que será descartado/);
  });

  it('external_inquiry no mesmo cenário mantém a menção a "cliente" (comportamento já existente, preservado)', async () => {
    const result = await planResponse(TOOL_CTX, CONTEXT_PACKAGE_WITH_TRIGGER, CLASSIFICATION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'answer_with_known_information',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          missingInformation: [],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'Rascunho que será descartado porque o plano mudou.',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('consult_professional');
    expect(result.decision.proposedResponse?.toLowerCase()).toMatch(/cliente/);
  });
});

// ADR 0007/0009 (20/10/2026, seção 2.3) — causa raiz P0 confirmada:
// nenhum mecanismo determinístico impedia repetir a MESMA pergunta de
// esclarecimento turno após turno (achado real: "mensal, anual ou
// ambos?" repetida até 10:06 sem avançar).
describe('planResponse — nunca repete a mesma pergunta de esclarecimento (ADR 0007/0009, 20/10/2026)', () => {
  function contextWithPriorAiMessage(priorAiText: string): ContextPackage {
    return {
      ...CONTEXT_PACKAGE,
      messages: {
        status: 'loaded',
        items: [
          {
            messageId: 'msg-ai-prior',
            createdAt: '2026-10-20T10:00:00Z',
            authorType: 'ai',
            direction: 'outbound',
            contentType: 'text',
            text: priorAiText,
            truncated: false,
            provenance: { sourceType: 'conversation_message', sourceId: 'msg-ai-prior' },
          },
          {
            messageId: 'msg-prof-trigger',
            createdAt: '2026-10-20T10:03:00Z',
            authorType: 'professional',
            direction: 'inbound',
            contentType: 'text',
            text: 'Mensal',
            truncated: false,
            provenance: { sourceType: 'conversation_message', sourceId: 'msg-prof-trigger' },
          },
        ],
        windowMessageCount: 2,
        windowSince: '2026-10-20T10:00:00Z',
      },
    };
  }

  it('clarify_ambiguity quase-idêntico à última pergunta de IA -> escala pra consult_professional', async () => {
    const result = await planResponse(TOOL_CTX, contextWithPriorAiMessage('É mensal, anual ou ambos?'), CLASSIFICATION_NO_MANDATORY_DECISION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'clarify_ambiguity',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          missingInformation: [],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'É mensal, anual ou ambos?',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('consult_professional');
    expect(result.decision.proposedResponse).not.toMatch(/mensal, anual ou ambos/i);
  });

  it('acknowledge quase-idêntico à última mensagem de IA também escala (mesma família de repetição)', async () => {
    const result = await planResponse(TOOL_CTX, contextWithPriorAiMessage('Entendi, só um instante que eu confirmo.'), CLASSIFICATION_NO_MANDATORY_DECISION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'acknowledge',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          missingInformation: [],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'Entendi, só um instante que eu confirmo.',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('consult_professional');
  });

  it('clarify_ambiguity claramente DIFERENTE da última pergunta de IA NUNCA escala (pergunta nova e legítima)', async () => {
    const result = await planResponse(TOOL_CTX, contextWithPriorAiMessage('É mensal, anual ou ambos?'), CLASSIFICATION_NO_MANDATORY_DECISION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'clarify_ambiguity',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          missingInformation: [],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'Pra qual data você precisa da proposta?',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('clarify_ambiguity');
    expect(result.decision.proposedResponse).toMatch(/Pra qual data/);
  });

  it('sem nenhuma mensagem de IA anterior nesta conversation, nunca escala (nada pra comparar)', async () => {
    const result = await planResponse(TOOL_CTX, CONTEXT_PACKAGE, CLASSIFICATION_NO_MANDATORY_DECISION, {
      maxRetries: 0,
      modelCall: async () => ({
        parsed: {
          responsePlan: 'clarify_ambiguity',
          commitmentNature: 'not_applicable',
          proposedDecisionCategory: [],
          missingInformation: [],
          evidenceUsed: [],
          professionalDecisionSignal: 'none',
          proposedResponse: 'É mensal, anual ou ambos?',
        },
        inputTokens: 1,
        outputTokens: 1,
      }),
    });
    expect(result.decision.responsePlan).toBe('clarify_ambiguity');
  });
});
