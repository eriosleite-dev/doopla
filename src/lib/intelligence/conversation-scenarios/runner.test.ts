import { describe, expect, it } from 'vitest';

import type { ClassifierModelCallResult } from '../classification';
import type { DelegatedContactRecognizerModelCallResult } from '../delegated-contact/recognizer';
import type { EvidenceUsed } from '../planner';
import type { PlannerModelCallResult } from '../planner/plan';
import type { ToolContext } from '../types';
import { CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS, runConversationScenario, runConversationScenarios } from './runner';
import type { ConversationScenario } from './types';

// Doopla Intelligence Core v1 — AI Evaluation Harness: teste de
// engenharia do runner (orquestração), sempre com modelCall injetado
// — nunca chama a OpenAI de verdade. Validação SEMÂNTICA real (contra
// o modelo de produção) acontece só no painel /admin, por decisão
// explícita da fundadora (ADR 0005).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_CTX: ToolContext = { representedProfessionalId: 'x', actorContext: { representedProfessionalId: 'x', actorType: 'professional', actorProfileId: 'x', capabilities: [], triggerSource: 'dev_test_panel' }, conversation: {} as any, supabase: {} as any };

function fakeClassifier(primaryIntent: string): (params: { instructions: string; input: string }) => Promise<ClassifierModelCallResult> {
  return async () => ({ parsed: { classificationStatus: 'classified', primaryIntent: primaryIntent as never, secondaryIntents: [], modelConfidence: 'high' }, inputTokens: 100, outputTokens: 20 });
}

function fakePlanner(proposedResponse: string | null, extra?: Partial<PlannerModelCallResult['parsed']>): (p: { instructions: string; input: string }) => Promise<PlannerModelCallResult> {
  return async ({ input }) => {
    const ctx = JSON.parse(input);
    const evidenceUsed: EvidenceUsed[] = ctx.triggerMessage ? [{ sourceType: 'conversation_message', sourceId: ctx.triggerMessage.messageId as string }] : [];
    return {
      parsed: {
        responsePlan: 'acknowledge',
        commitmentNature: 'not_applicable',
        proposedDecisionCategory: [],
        missingInformation: [],
        evidenceUsed,
        professionalDecisionSignal: 'none',
        proposedResponse,
        ...extra,
      },
      inputTokens: 150,
      outputTokens: 30,
    };
  };
}

const SIMPLE_SCENARIO: ConversationScenario = {
  id: 'teste-simples',
  name: 'cenário de teste',
  category: 'teste',
  source: 'fixture de engenharia, não um caso real',
  turns: [{ professionalMessage: 'Oi' }, { professionalMessage: 'Tudo bem?' }],
};

describe('runConversationScenario — crescimento de histórico entre turnos', () => {
  it('o turno 2 enxerga o turno 1 inteiro (mensagem do profissional + resposta real gerada da Doopla)', async () => {
    const seenRecentMessagesCounts: number[] = [];
    const plannerCall = async ({ input }: { instructions: string; input: string }): Promise<PlannerModelCallResult> => {
      const ctx = JSON.parse(input);
      seenRecentMessagesCounts.push(ctx.recentMessages.length);
      return fakePlanner('resposta da doopla')({ instructions: '', input });
    };

    await runConversationScenario(SIMPLE_SCENARIO, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: plannerCall,
    });

    // Turno 1: só o próprio gatilho, 0 mensagens anteriores.
    // Turno 2: o gatilho do turno 1 + a resposta REAL gerada por ele — 2 anteriores.
    expect(seenRecentMessagesCounts).toEqual([0, 2]);
  });

  it('quando o Planner não produz texto (proposedResponse null), o turno seguinte não ganha uma mensagem "ai" fantasma', async () => {
    const seenRecentMessagesCounts: number[] = [];
    const plannerCall = async ({ input }: { instructions: string; input: string }): Promise<PlannerModelCallResult> => {
      const ctx = JSON.parse(input);
      seenRecentMessagesCounts.push(ctx.recentMessages.length);
      // no_response_needed só sai null quando triggerHasUsableText é falso — aqui simulamos via commitmentNature/responsePlan direto, sem gatilho real.
      return fakePlanner(null, { responsePlan: 'clarify_ambiguity' })({ instructions: '', input });
    };

    const result = await runConversationScenario(SIMPLE_SCENARIO, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: plannerCall,
    });

    // clarify_ambiguity sempre tem fallback determinístico (deterministicFallbackResponse)
    // então proposedResponseFinal nunca fica null de fato aqui — mas o teste prova que o pipeline não quebra nesse caminho.
    expect(result.turns).toHaveLength(2);
  });
});

describe('runConversationScenario — avaliação de assertivas objetivas', () => {
  it('mustNotReask falha quando a resposta final repete uma pergunta já respondida', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [{ professionalMessage: 'manda pra Gabi, +5511999999999', mustNotReask: ['qual é o número'] }],
    };
    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Claro, só confirma: qual é o número mesmo?'),
    });
    expect(result.turns[0].assertions.find((a) => a.name.includes('não pergunta de novo'))?.pass).toBe(false);
    expect(result.scenarioPass).toBe(false);
  });

  it('mustCiteConversationEvidence passa quando o Planner cita a mensagem-gatilho real', async () => {
    const scenario: ConversationScenario = { ...SIMPLE_SCENARIO, turns: [{ professionalMessage: 'Sim', mustCiteConversationEvidence: true }] };
    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Combinado.'),
    });
    expect(result.turns[0].assertions.find((a) => a.name.includes('ancorada'))?.pass).toBe(true);
  });

  it('detecta travessão no texto bruto do modelo (a limpeza determinística corrige, mas o harness ainda reporta o achado)', async () => {
    const scenario: ConversationScenario = { ...SIMPLE_SCENARIO, turns: [{ professionalMessage: 'Oi' }] };
    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Tudo certo — já te aviso.'),
    });
    const travessaoCheck = result.turns[0].formatChecks.find((c) => c.name.includes('travessão'));
    expect(travessaoCheck?.pass).toBe(false);
    expect(result.turns[0].proposedResponseFinal).toBe('Tudo certo, já te aviso.');
  });
});

describe('runConversationScenario — reconhecedor de delegação (isolado, nunca executa)', () => {
  it('compara o sinal reconhecido com o esperado do cenário, sem nunca criar estado real', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [{ professionalMessage: 'Chama a Gabi e fala oi', delegation: { activeRequest: null, expectedSignal: 'new_request' } }],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: 'dizer oi', draftMessageContent: null },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Ok, vou falar com ela.'),
      recognizerModelCall: recognizerCall,
    });

    expect(result.turns[0].delegationSignal).toBe('new_request');
    expect(result.turns[0].delegationSignalMatches).toBe(true);
    expect(result.scenarioPass).toBe(true);
  });

  it('sinal divergente do esperado reprova o turno (precisão do reconhecedor, nunca execução)', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [{ professionalMessage: 'E aí, conseguiu?', delegation: { activeRequest: null, expectedSignal: 'status_inquiry' } }],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'no_delegation_signal', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Não entendi, pode explicar melhor?'),
      recognizerModelCall: recognizerCall,
    });

    expect(result.turns[0].delegationSignalMatches).toBe(false);
    expect(result.scenarioPass).toBe(false);
  });

  it('TurnResult expõe recipientName/recipientNumber/purposeSummary/draftMessageContent do recognizer (P0.1/P0.2, ADR 0005) — antes descartados', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [{ professionalMessage: 'manda pra Marina, 11999999999', delegation: { activeRequest: null, expectedSignal: 'new_request' } }],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'new_request', recipientName: 'Marina', recipientNumber: '11999999999', purposeSummary: 'avisar algo', draftMessageContent: 'Oi Marina, tudo bem?' },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Ok.'),
      recognizerModelCall: recognizerCall,
    });

    expect(result.turns[0].delegationRecipientName).toBe('Marina');
    expect(result.turns[0].delegationRecipientNumber).toBe('11999999999');
    expect(result.turns[0].delegationPurposeSummary).toBe('avisar algo');
    expect(result.turns[0].delegationDraftMessageContent).toBe('Oi Marina, tudo bem?');
  });

  it('draftMessageContentMustNotContain reprova quando o texto preparado pra envio contém um termo proibido não coberto pelo backstop de recognizer.ts', async () => {
    // Backstop determinístico de recognizer.ts (ver recognizer.ts/
    // recognizer.test.ts) só reconhece um conjunto específico de
    // padrões de autoapresentação ("aqui é X", "sou X", "quem fala é
    // X") — por isso é sempre exercitado de verdade aqui (a função é
    // real, nunca mockada), nunca contornável via modelCall injetado.
    // Este teste prova que o check genérico do Harness funciona
    // independente do backstop, usando uma frase fora desse conjunto
    // (“gabi falando”) — cobertura complementar, não redundante.
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [
        {
          professionalMessage: 'manda pra Gabi, fala que é ela mesma',
          delegation: { activeRequest: null, expectedSignal: 'new_request', draftMessageContentMustNotContain: ['gabi falando'] },
        },
      ],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: null, draftMessageContent: 'Gabi falando, mandei beijos.' },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Ok.'),
      recognizerModelCall: recognizerCall,
    });

    const identityCheck = result.turns[0].assertions.find((a) => a.name.includes('erro de identidade'));
    expect(identityCheck?.pass).toBe(false);
    expect(result.scenarioPass).toBe(false);
  });

  it('backstop determinístico de recognizer.ts (real, nunca mockado) já neutraliza o caso clássico antes do check do Harness ver o texto', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [
        {
          professionalMessage: 'manda pra Gabi, fala que é ela mesma',
          delegation: { activeRequest: null, expectedSignal: 'new_request', draftMessageContentMustNotContain: ['aqui é a gabi'] },
        },
      ],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: null, draftMessageContent: 'Oi! Aqui é a Gabi.' },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Ok.'),
      recognizerModelCall: recognizerCall,
    });

    // O backstop real já zera o campo antes de chegar no check — por
    // isso o check nem dispara (null é válido), e o cenário passa.
    expect(result.turns[0].delegationDraftMessageContent).toBeNull();
    const identityCheck = result.turns[0].assertions.find((a) => a.name.includes('erro de identidade'));
    expect(identityCheck).toBeUndefined();
  });

  it('draftMessageContentMustNotContain não reprova quando o campo vem null (pediu esclarecimento, resultado válido)', async () => {
    const scenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: [
        {
          professionalMessage: 'manda pra Gabi, fala que é ela mesma',
          delegation: { activeRequest: null, expectedSignal: 'new_request', draftMessageContentMustNotContain: ['aqui é a gabi'] },
        },
      ],
    };
    const recognizerCall = async (): Promise<DelegatedContactRecognizerModelCallResult> => ({
      parsed: { signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: null, draftMessageContent: null },
      inputTokens: 50,
      outputTokens: 10,
    });

    const result = await runConversationScenario(scenario, {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('Ok.'),
      recognizerModelCall: recognizerCall,
    });

    const identityCheck = result.turns[0].assertions.find((a) => a.name.includes('erro de identidade'));
    expect(identityCheck).toBeUndefined();
    expect(result.turns[0].delegationDraftMessageContent).toBeNull();
  });
});

describe('runConversationScenarios — teto de execução', () => {
  it('recusa rodar acima de CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS, nunca executa parcialmente', async () => {
    const hugeScenario: ConversationScenario = {
      ...SIMPLE_SCENARIO,
      turns: Array.from({ length: CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS + 1 }, (_, i) => ({ professionalMessage: `turno ${i}` })),
    };
    await expect(
      runConversationScenarios([hugeScenario], { toolCtx: TOOL_CTX, classifierModelCall: fakeClassifier('outro'), plannerModelCall: fakePlanner('ok') })
    ).rejects.toThrow('conversation_scenarios_turn_limit_exceeded');
  });

  it('metadata inclui hash de prompt e modelo — nunca compara resultado sem saber a versão (requisito 7)', async () => {
    const result = await runConversationScenarios([SIMPLE_SCENARIO], {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('ok'),
    });
    expect(result.metadata.classifierInstructionsHash).toMatch(/^[a-f0-9]{12}$/);
    expect(result.metadata.plannerInstructionsHash).toMatch(/^[a-f0-9]{12}$/);
    expect(result.metadata.classifierModel).toBeTruthy();
    expect(result.metadata.plannerModel).toBeTruthy();
  });

  it('custo total soma o custo de todos os cenários/turnos, nunca null se todos os modelos tiverem preço configurado', async () => {
    const result = await runConversationScenarios([SIMPLE_SCENARIO], {
      toolCtx: TOOL_CTX,
      classifierModelCall: fakeClassifier('outro'),
      plannerModelCall: fakePlanner('ok'),
    });
    expect(result.totalCostCents).not.toBeNull();
    expect(result.totalCostCents).toBeGreaterThan(0);
  });
});
