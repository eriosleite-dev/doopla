import { describe, expect, it } from 'vitest';

import { jaccardWordSimilarity } from './text-similarity';

describe('jaccardWordSimilarity', () => {
  it('1 pra textos idênticos', () => {
    expect(jaccardWordSimilarity('Posso ajudar com isso!', 'Posso ajudar com isso!')).toBe(1);
  });

  it('1 pra textos iguais ignorando só pontuação/caixa', () => {
    expect(jaccardWordSimilarity('Posso ajudar, com isso?', 'posso ajudar com isso')).toBe(1);
  });

  it('0 pra textos sem nenhuma palavra em comum', () => {
    expect(jaccardWordSimilarity('quanto custa um show', 'oi tudo bem')).toBe(0);
  });

  it('valor intermediário pra textos parcialmente parecidos', () => {
    const sim = jaccardWordSimilarity('Posso ajudar com isso, só um instante', 'Posso ajudar com isso, já te retorno');
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.9);
  });

  it('1 quando os dois textos são vazios', () => {
    expect(jaccardWordSimilarity('', '')).toBe(1);
  });

  it('0 quando só um dos dois é vazio', () => {
    expect(jaccardWordSimilarity('oi', '')).toBe(0);
  });
});
