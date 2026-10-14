import { describe, expect, it } from 'vitest';

import { buildPlannerInstructions } from './prompt';

// P1 UX conversacional (14/10/2026) — a instrução de estilo (item 7)
// é a única mudança autorizada neste módulo; estes testes cobrem só
// isso, nunca a lógica de responsePlan/commitmentNature/etc (fora de
// escopo, intocada).

describe('buildPlannerInstructions — estilo e formatação (P1, 14/10/2026)', () => {
  const instructions = buildPlannerInstructions();

  it('instrui a nunca usar travessão', () => {
    expect(instructions).toMatch(/[Nn]unca.*travessão/);
  });

  it('instrui parágrafos curtos só quando há mais de um assunto, nunca quebra artificial por frase', () => {
    expect(instructions).toMatch(/par[aá]grafo/);
    expect(instructions).toMatch(/mais de um assunto/);
  });

  it('instrui moderação de emoji e nunca coração roxo recorrente', () => {
    expect(instructions).toMatch(/emoji/);
    expect(instructions).toMatch(/coração roxo/);
  });

  it('o próprio texto da instrução de estilo não contém nenhum travessão fora do exemplo do caractere proibido', () => {
    const start = instructions.indexOf('Estilo e formatação');
    const end = instructions.indexOf('Regra crítica:');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const styleParagraph = instructions.slice(start, end);
    const dashCount = (styleParagraph.match(/—/g) ?? []).length;
    // Exatamente 1: o travessão citado dentro de "(—)" pra nomear o
    // caractere proibido — nunca um travessão de verdade na nossa
    // própria prosa, o que contradiria a regra sendo ensinada.
    expect(dashCount).toBe(1);
  });
});
