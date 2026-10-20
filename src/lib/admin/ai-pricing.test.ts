import { describe, expect, it } from 'vitest';

import { estimateAiCostCents, MODEL_PRICE_TABLE } from './ai-pricing';

// Doopla — cobertura real pra uma lógica que até hoje não tinha teste
// nenhum, apesar de ser a única fonte de "quanto a IA custa" mostrada
// no painel Admin (/admin/ia-custo). Achado de auditoria (Head of AI,
// 15/10/2026): ai-pricing.ts existe desde 01/10/2026, bem desenhado
// (tabela versionada por data, preço confirmado pela fundadora), mas
// zero teste automatizado protegia essa matemática contra regressão.

describe('estimateAiCostCents', () => {
  it('calcula o custo real pro único modelo em uso hoje (gpt-5-mini): $0,25/1M input, $2,00/1M output', () => {
    const result = estimateAiCostCents({
      model: 'gpt-5-mini',
      usageDate: '2026-10-15',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(result).toEqual({ configured: true, costCents: 25 + 200 });
  });

  it('é proporcional a tokens parciais (não arredonda pra cima/baixo escondido)', () => {
    const result = estimateAiCostCents({
      model: 'gpt-5-mini',
      usageDate: '2026-10-15',
      inputTokens: 500_000,
      outputTokens: 250_000,
    });
    expect(result).toEqual({ configured: true, costCents: 12.5 + 50 });
  });

  it('zero tokens -> custo zero, mas ainda configured:true (nunca confunde "sem uso" com "sem preço")', () => {
    const result = estimateAiCostCents({ model: 'gpt-5-mini', usageDate: '2026-10-15', inputTokens: 0, outputTokens: 0 });
    expect(result).toEqual({ configured: true, costCents: 0 });
  });

  it('modelo desconhecido -> configured:false, nunca inventa um preço', () => {
    const result = estimateAiCostCents({ model: 'gpt-7-ultra-nao-existe', usageDate: '2026-10-15', inputTokens: 1000, outputTokens: 1000 });
    expect(result).toEqual({ configured: false });
  });

  it('data de uso ANTES de qualquer effectiveFrom da tabela -> configured:false (nunca aplica retroativamente uma regra que não existia ainda)', () => {
    const result = estimateAiCostCents({ model: 'gpt-5-mini', usageDate: '2024-01-01', inputTokens: 1000, outputTokens: 1000 });
    expect(result).toEqual({ configured: false });
  });

  it('data de uso EXATAMENTE em effectiveFrom -> regra se aplica (limite inclusive, conforme o comentário do arquivo)', () => {
    const rule = MODEL_PRICE_TABLE.find((r) => r.model === 'gpt-5-mini');
    expect(rule).toBeDefined();
    const result = estimateAiCostCents({ model: 'gpt-5-mini', usageDate: rule!.effectiveFrom, inputTokens: 1_000_000, outputTokens: 0 });
    expect(result).toEqual({ configured: true, costCents: rule!.inputCentsPerMillionTokens });
  });

  it('gpt-5-mini nunca aplica desconto de cached input, mesmo se cachedInputTokens for passado -- esse modelo não tem cachedInputCentsPerMillionTokens cadastrado', () => {
    const result = estimateAiCostCents({ model: 'gpt-5-mini', usageDate: '2026-10-15', inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 500_000 });
    expect(result).toEqual({ configured: true, costCents: 25 });
  });

  it('calcula o custo real do gpt-5.6-terra (ADR 0007 item 5, comparação de modelos): $2,00/1M input, $12,00/1M output', () => {
    const result = estimateAiCostCents({ model: 'gpt-5.6-terra', usageDate: '2026-10-20', inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(result).toEqual({ configured: true, costCents: 200 + 1200 });
  });

  it('gpt-5.6-terra: tokens de input servidos do cache usam o preço de cache ($0,20/1M), nunca o preço cheio pra essa parte', () => {
    const result = estimateAiCostCents({
      model: 'gpt-5.6-terra',
      usageDate: '2026-10-20',
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 400_000,
    });
    // 600k não-cache a $2,00/1M + 400k cache a $0,20/1M
    expect(result).toEqual({ configured: true, costCents: (600_000 / 1_000_000) * 200 + (400_000 / 1_000_000) * 20 });
  });

  it('cachedInputTokens=0 (ou omitido) nunca aplica o preço de cache, mesmo quando o modelo tem a taxa cadastrada', () => {
    const result = estimateAiCostCents({ model: 'gpt-5.6-terra', usageDate: '2026-10-20', inputTokens: 1_000_000, outputTokens: 0 });
    expect(result).toEqual({ configured: true, costCents: 200 });
  });
});

describe('MODEL_PRICE_TABLE', () => {
  it('cada modelo tem no máximo uma regra por effectiveFrom (nunca duas regras ambíguas pra mesma data)', () => {
    const seen = new Set<string>();
    for (const rule of MODEL_PRICE_TABLE) {
      const key = `${rule.model}|${rule.effectiveFrom}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('nenhuma regra tem preço negativo ou zero (um preço zerado seria um erro de dado, não uma promoção real)', () => {
    for (const rule of MODEL_PRICE_TABLE) {
      expect(rule.inputCentsPerMillionTokens).toBeGreaterThan(0);
      expect(rule.outputCentsPerMillionTokens).toBeGreaterThan(0);
    }
  });
});
