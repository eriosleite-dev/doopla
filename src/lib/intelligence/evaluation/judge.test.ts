import { describe, expect, it } from 'vitest';

import { evaluateConversationOutcome, type EvaluationJudgeModelCallResult } from './judge';
import { INCIDENT_FIXTURES } from './incident-fixtures';

// ADR 0011 (Fase A->B) — juiz isolado de avaliação automática. Mesma
// disciplina do resto do projeto: modelCall sempre injetado, nunca
// chama a OpenAI de verdade (este sandbox não tem acesso real —
// quando a fundadora rodar isto com acesso real, INCIDENT_FIXTURES é
// o dataset pra comparar o veredito REAL do model contra o ground
// truth abaixo).

function fakeModelCall(parsed: EvaluationJudgeModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('evaluateConversationOutcome', () => {
  it('verdict=ok é reconhecido', async () => {
    const result = await evaluateConversationOutcome(
      { transcript: [{ authorType: 'professional', text: 'oi' }], finalAiAction: 'oi! como posso ajudar?' },
      { modelCall: fakeModelCall({ verdict: 'ok', failureCategory: null, reasoning: 'resposta adequada' }) }
    );
    expect(result.verdict).toBe('ok');
    expect(result.failureCategory).toBeNull();
  });

  it('verdict=failure com categoria válida é reconhecido', async () => {
    const result = await evaluateConversationOutcome(
      { transcript: [{ authorType: 'professional', text: '?' }], finalAiAction: 'resposta sobre assunto antigo não relacionado' },
      { modelCall: fakeModelCall({ verdict: 'failure', failureCategory: 'context_loss', reasoning: 'ignorou a pergunta recente' }) }
    );
    expect(result.verdict).toBe('failure');
    expect(result.failureCategory).toBe('context_loss');
  });

  it('verdict=failure SEM categoria nunca sobrevive como failure — cai pra inconclusive (guarda estrutural)', async () => {
    const result = await evaluateConversationOutcome(
      { transcript: [], finalAiAction: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { modelCall: fakeModelCall({ verdict: 'failure', failureCategory: null, reasoning: 'falha sem categoria' } as any) }
    );
    expect(result.verdict).toBe('inconclusive');
    expect(result.failureCategory).toBeNull();
  });

  it('falha total do model (parsed=null) vira inconclusive, NUNCA ok (um juiz com bug nunca deve esconder falhas por default)', async () => {
    const result = await evaluateConversationOutcome({ transcript: [], finalAiAction: null }, { modelCall: fakeModelCall(null), maxRetries: 0 });
    expect(result.verdict).toBe('inconclusive');
  });

  it('exceção lançada pelo modelCall nunca escapa (engolida, mesmo padrão do resto do projeto)', async () => {
    const result = await evaluateConversationOutcome(
      { transcript: [], finalAiAction: null },
      {
        modelCall: async () => {
          throw new Error('falha de rede simulada');
        },
        maxRetries: 0,
      }
    );
    expect(result.verdict).toBe('inconclusive');
  });

  it('soma tokens de todas as tentativas, nunca só a última', async () => {
    let call = 0;
    const result = await evaluateConversationOutcome(
      { transcript: [], finalAiAction: 'ok' },
      {
        maxRetries: 2,
        modelCall: async () => {
          call++;
          if (call === 1) return { parsed: null, inputTokens: 100, outputTokens: 20 };
          return { parsed: { verdict: 'ok' as const, failureCategory: null, reasoning: 'ok' }, inputTokens: 90, outputTokens: 18 };
        },
      }
    );
    expect(result.inputTokens).toBe(100 + 90);
    expect(result.outputTokens).toBe(20 + 18);
  });

  // ADR 0011 — demonstra o MÉTODO de validação offline contra ground
  // truth conhecido (incident-fixtures.ts): aqui o modelCall é
  // injetado pra simular que o model respondeu EXATAMENTE o esperado,
  // provando que a função de parsing/guarda estrutural do juiz nunca
  // distorce um veredito correto. A VALIDAÇÃO REAL (o model de fato
  // acerta esses casos?) só é possível com acesso real à OpenAI —
  // registrado como próximo passo no ADR, nunca fingido aqui.
  it.each(INCIDENT_FIXTURES)('fixture "$name" ($sourceAdr): pipeline do juiz preserva o ground truth quando o model responde corretamente', async (fixture) => {
    const result = await evaluateConversationOutcome(fixture.input, {
      modelCall: fakeModelCall({
        verdict: fixture.expectedVerdict,
        failureCategory: fixture.expectedFailureCategory,
        reasoning: `simulação de ground truth para ${fixture.name}`,
      }),
    });
    expect(result.verdict).toBe(fixture.expectedVerdict);
    expect(result.failureCategory).toBe(fixture.expectedFailureCategory);
  });
});
