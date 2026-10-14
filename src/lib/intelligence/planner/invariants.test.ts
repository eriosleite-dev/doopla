import { describe, expect, it } from 'vitest';

import { deterministicFallbackResponse } from './invariants';

// P1 UX conversacional (14/10/2026) — fix isolado do travessão literal
// no fallback determinístico (nunca lógica, só a string). Cobre
// exatamente os dois únicos planos com fallback de texto.

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
});
