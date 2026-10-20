import { describe, expect, it } from 'vitest';

import { buildPlannerInstructions } from './prompt';
import { applyTerraVariantAddendum, buildPlannerInstructionsTerraVariant, TERRA_VARIANT_ADDENDUM_V1 } from './prompt-variants';

// Task "CODE | Otimização do Planner para gpt-5.6-terra" (20/10/2026).
// Mesma disciplina do resto do projeto: nunca testa julgamento
// semântico aqui (isso é golden-suite real, contra o model de
// verdade) — só a MECÂNICA da variante (nunca remove/reescreve o
// prompt base, nunca usada por engano no caminho de produção).

describe('applyTerraVariantAddendum', () => {
  it('nunca remove ou reescreve o prompt base — é sempre base + addendum, nunca um substituto', () => {
    const base = buildPlannerInstructions({});
    const withVariant = applyTerraVariantAddendum(base);
    expect(withVariant.startsWith(base)).toBe(true);
    expect(withVariant).toBe(`${base}${TERRA_VARIANT_ADDENDUM_V1}`);
  });

  it('nunca duplica o addendum mesmo aplicado sobre instruções já compostas (playbook/institucional)', () => {
    const base = buildPlannerInstructions({ competencies: ['comercial_negociacao'], conversationType: 'professional_self' });
    const withVariant = applyTerraVariantAddendum(base);
    const occurrences = withVariant.split('VARIANTE EXPERIMENTAL').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('buildPlannerInstructionsTerraVariant', () => {
  it('equivale a buildPlannerInstructions(opts) + addendum, pros mesmos opts', () => {
    const opts = { competencies: ['producao'] as const, conversationType: 'external_inquiry' };
    const expected = `${buildPlannerInstructions(opts)}${TERRA_VARIANT_ADDENDUM_V1}`;
    expect(buildPlannerInstructionsTerraVariant(opts)).toBe(expected);
  });

  it('sem opts, ainda monta um prompt válido (base default + addendum)', () => {
    const result = buildPlannerInstructionsTerraVariant();
    expect(result.startsWith(buildPlannerInstructions({}))).toBe(true);
  });
});

describe('TERRA_VARIANT_ADDENDUM_V1 — cobertura dos 3 princípios reforçados (nunca frases literais dos casos de teste)', () => {
  it('nunca menciona as frases literais dos casos de teste que motivaram a variante', () => {
    // Requisito explícito da fundadora: "não quero adicionar exceções
    // para frases específicas". Garante que a correção ficou no nível
    // de princípio, nunca memorizando o enunciado exato dos cenários.
    expect(TERRA_VARIANT_ADDENDUM_V1).not.toContain('Qual horário ficou');
    expect(TERRA_VARIANT_ADDENDUM_V1).not.toContain('palco');
    expect(TERRA_VARIANT_ADDENDUM_V1).not.toContain('Qual foi mesmo o valor combinado');
  });

  it('reforça: recuperar fato já disponível nunca é decisão nova (casos 14/25)', () => {
    expect(TERRA_VARIANT_ADDENDUM_V1).toMatch(/nunca trate recuperar um fato como se fosse abrir uma decisão nova/i);
  });

  it('reforça: verificar contexto disponível antes de escalar (caso 14)', () => {
    expect(TERRA_VARIANT_ADDENDUM_V1).toMatch(/verifique primeiro se o fato já está disponível/i);
  });

  it('reforça: reconhecer confirmação contextual em mensagens curtas (caso 8)', () => {
    expect(TERRA_VARIANT_ADDENDUM_V1).toMatch(/mensagens curtas do profissional/i);
  });

  it('nunca enfraquece a régua de ambiguidade — mantém a exigência de referente específico', () => {
    expect(TERRA_VARIANT_ADDENDUM_V1).toMatch(/nunca autoriza presumir aprovação/i);
  });
});
