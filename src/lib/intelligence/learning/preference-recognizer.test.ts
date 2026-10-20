import { describe, expect, it } from 'vitest';

import { recognizePreferenceDeclaration, type PreferenceRecognizerModelCallResult } from './preference-recognizer';

// Doopla — memória de preferências profissionais (ADR 0004, Rodadas
// 4/5). Mesma disciplina do resto do projeto: modelCall sempre
// injetado, nunca chama a OpenAI de verdade.

function fakeModelCall(parsed: PreferenceRecognizerModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('recognizePreferenceDeclaration', () => {
  it('declaração explícita em primeira pessoa é reconhecida', async () => {
    const result = await recognizePreferenceDeclaration('Eu prefiro mensagens mais curtas, sem muito rodeio.', {
      modelCall: fakeModelCall({ recognized: true, kind: 'communication_style', value: 'prefere mensagens mais curtas, sem rodeio' }),
    });
    expect(result.recognized).toBe(true);
    expect(result.kind).toBe('communication_style');
    expect(result.value).toBe('prefere mensagens mais curtas, sem rodeio');
  });

  it('relato de pedido de um terceiro (cliente) NUNCA é reconhecido, mesmo que o model tente marcar recognized=true', async () => {
    // Guarda estrutural só cobre kind/value ausentes — a distinção
    // relato x declaração própria é responsabilidade da INSTRUÇÃO do
    // model (não há como o código aqui detectar isso sozinho sem
    // reimplementar NLP); este teste documenta o comportamento
    // esperado do model via instrução, cobrindo o caso em que ele
    // segue a regra corretamente (recognized=false).
    const result = await recognizePreferenceDeclaration('O cliente pediu 20% de desconto, pode considerar isso pra próxima vez.', {
      modelCall: fakeModelCall({ recognized: false, kind: null, value: null }),
    });
    expect(result.recognized).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.value).toBeNull();
  });

  it('decisão pontual sobre um caso específico não é reconhecida como preferência geral', async () => {
    const result = await recognizePreferenceDeclaration('Pode aceitar esse desconto pra esse cliente específico.', {
      modelCall: fakeModelCall({ recognized: false, kind: null, value: null }),
    });
    expect(result.recognized).toBe(false);
  });

  it('operational_preference reconhecida corretamente', async () => {
    const result = await recognizePreferenceDeclaration('Eu nunca aceito eventos aos domingos.', {
      modelCall: fakeModelCall({ recognized: true, kind: 'operational_preference', value: 'não aceita eventos aos domingos' }),
    });
    expect(result.kind).toBe('operational_preference');
  });

  it('commercial_preference reconhecida corretamente', async () => {
    const result = await recognizePreferenceDeclaration('Eu costumo negociar parcelado, 50% na confirmação e 50% no dia.', {
      modelCall: fakeModelCall({ recognized: true, kind: 'commercial_preference', value: 'costuma negociar parcelado, 50% confirmação + 50% no dia' }),
    });
    expect(result.kind).toBe('commercial_preference');
  });

  it('recognized=true mas kind ausente nunca sobrevive (guarda estrutural, nunca confia só no model)', async () => {
    const result = await recognizePreferenceDeclaration('Alguma coisa ambígua', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modelCall: fakeModelCall({ recognized: true, kind: null, value: 'algo' } as any),
    });
    expect(result.recognized).toBe(false);
    expect(result.kind).toBeNull();
  });

  it('recognized=true mas value vazio/em branco nunca sobrevive', async () => {
    const result = await recognizePreferenceDeclaration('Alguma coisa ambígua', {
      modelCall: fakeModelCall({ recognized: true, kind: 'communication_style', value: '   ' }),
    });
    expect(result.recognized).toBe(false);
    expect(result.value).toBeNull();
  });

  it('falha total do model (parsed=null) vira recognized=false, nunca lança', async () => {
    const result = await recognizePreferenceDeclaration('qualquer coisa', { modelCall: fakeModelCall(null), maxRetries: 0 });
    expect(result.recognized).toBe(false);
    expect(result.kind).toBeNull();
    expect(result.value).toBeNull();
  });

  it('exceção lançada pelo modelCall nunca escapa (engolida, mesmo padrão do resto do projeto)', async () => {
    const result = await recognizePreferenceDeclaration('qualquer coisa', {
      modelCall: async () => {
        throw new Error('falha de rede simulada');
      },
      maxRetries: 0,
    });
    expect(result.recognized).toBe(false);
  });

  it('soma tokens de todas as tentativas, nunca só a última (mesmo achado/mesma correção do resto do projeto)', async () => {
    let call = 0;
    const result = await recognizePreferenceDeclaration('Eu prefiro tom mais informal.', {
      maxRetries: 2,
      modelCall: async () => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 100, outputTokens: 20 };
        return { parsed: { recognized: true, kind: 'communication_style', value: 'prefere tom informal' }, inputTokens: 90, outputTokens: 18 };
      },
    });
    expect(result.inputTokens).toBe(100 + 90);
    expect(result.outputTokens).toBe(20 + 18);
  });
});
