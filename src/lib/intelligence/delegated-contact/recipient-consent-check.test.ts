import { describe, expect, it } from 'vitest';

import { checkRecipientConsent, type RecipientConsentCheckModelCallResult } from './recipient-consent-check';

// Doopla — "Doopla chama o cliente" (Etapa 2.1). Requisito explícito da
// fundadora: recusa/pedido pra não contatar/bloqueio nunca envia; e,
// por extensão, qualquer caso não claramente positivo (ambiguous) ou
// falha total do model também nunca envia — só "proceed" libera.

function fakeModelCall(parsed: RecipientConsentCheckModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 5, outputTokens: 2 });
}

describe('checkRecipientConsent', () => {
  it('resposta claramente receptiva -> proceed', async () => {
    const result = await checkRecipientConsent('oi, pode falar sim', { modelCall: fakeModelCall({ outcome: 'proceed' }) });
    expect(result.outcome).toBe('proceed');
  });

  it('recusa explícita -> declined', async () => {
    const result = await checkRecipientConsent('não quero receber mensagens, para de mandar', { modelCall: fakeModelCall({ outcome: 'declined' }) });
    expect(result.outcome).toBe('declined');
  });

  it('resposta ambígua -> ambiguous, nunca proceed', async () => {
    const result = await checkRecipientConsent('quem é você?', { modelCall: fakeModelCall({ outcome: 'ambiguous' }) });
    expect(result.outcome).toBe('ambiguous');
  });

  it('falha total do model (exceção) -> ambiguous, NUNCA proceed (fail-closed)', async () => {
    const result = await checkRecipientConsent('qualquer coisa', {
      modelCall: async () => {
        throw new Error('timeout');
      },
      maxRetries: 0,
    });
    expect(result.outcome).toBe('ambiguous');
  });

  it('parsed null (sem exceção) também cai em ambiguous', async () => {
    const result = await checkRecipientConsent('qualquer coisa', { modelCall: fakeModelCall(null), maxRetries: 0 });
    expect(result.outcome).toBe('ambiguous');
  });
});
