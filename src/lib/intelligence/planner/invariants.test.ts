import { describe, expect, it } from 'vitest';

import { deterministicFallbackResponse } from './invariants';

// P1 UX conversacional (14/10/2026) — fix isolado do travessão literal
// no fallback determinístico (nunca lógica, só a string). Cobre
// exatamente os três planos com fallback de texto.

describe('deterministicFallbackResponse — sem travessão (P1, 14/10/2026)', () => {
  it('consult_professional nunca contém travessão', () => {
    const text = deterministicFallbackResponse('consult_professional');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });

  it('acknowledge nunca contém travessão', () => {
    const text = deterministicFallbackResponse('acknowledge');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });

  it('clarify_ambiguity nunca contém travessão', () => {
    const text = deterministicFallbackResponse('clarify_ambiguity');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });
});

// Achado real de produção (teste controlado da Etapa 2.1, 14/10/2026):
// uma mensagem informativa/solta do professional_self (ex.: "ok, é ela
// ok?") caía no piso de baixa confiança -> clarify_ambiguity, o model
// propunha no_response_needed (draft null) e, sem fallback pra
// clarify_ambiguity, o ciclo inteiro ficava em silêncio (pipeline.ts só
// age quando decision.proposedResponse é truthy). Este teste trava que
// o plano nunca mais fica sem texto.
describe('deterministicFallbackResponse — clarify_ambiguity nunca silencioso (achado real, 15/10/2026)', () => {
  it('ask_external_participant e answer_with_known_information continuam null (dependem do texto real do model)', () => {
    expect(deterministicFallbackResponse('ask_external_participant')).toBeNull();
    expect(deterministicFallbackResponse('answer_with_known_information')).toBeNull();
  });

  it('clarify_ambiguity sempre retorna um texto não vazio', () => {
    const text = deterministicFallbackResponse('clarify_ambiguity');
    expect(text).not.toBeNull();
    expect(text?.trim().length).toBeGreaterThan(0);
  });
});
