import { describe, expect, it } from 'vitest';

import { recognizeDelegatedContactRequest, type DelegatedContactRecognizerModelCallResult } from './recognizer';

// Doopla — "Doopla chama o cliente" (Etapa 2.1). Mesma disciplina de
// extractor.test.ts/detector.test.ts: modelCall sempre injetado, nunca
// chama a OpenAI de verdade.

function fakeModelCall(parsed: DelegatedContactRecognizerModelCallResult['parsed']) {
  return async () => ({ parsed, inputTokens: 10, outputTokens: 5 });
}

describe('recognizeDelegatedContactRequest', () => {
  it('new_request preserva os campos extraídos', async () => {
    const result = await recognizeDelegatedContactRequest(
      "manda uma mensagem pra Marina, 11999999999: 'confirma presença no evento de sábado?'",
      null,
      {
        modelCall: fakeModelCall({
          signal: 'new_request',
          recipientName: 'Marina',
          recipientNumber: '11999999999',
          purposeSummary: 'confirmar presença no evento de sábado',
          draftMessageContent: 'confirma presença no evento de sábado?',
        }),
      }
    );
    expect(result.signal).toBe('new_request');
    expect(result.recipientNumber).toBe('11999999999');
    expect(result.draftMessageContent).toBe('confirma presença no evento de sábado?');
  });

  it('status_inquiry NUNCA preserva campos de extração, mesmo se o model tentar preencher', async () => {
    const result = await recognizeDelegatedContactRequest(
      'enviou?',
      { status: 'executed', literalContentGate: 'awaiting_recipient_reply', recipientName: 'Marina', recipientNumberKnown: true, pendingConfirmationText: null },
      {
        modelCall: fakeModelCall({
          signal: 'status_inquiry',
          recipientName: 'Marina', // model "vazando" contexto — nunca deve sobreviver
          recipientNumber: null,
          purposeSummary: null,
          draftMessageContent: null,
        }),
      }
    );
    expect(result.signal).toBe('status_inquiry');
    expect(result.recipientName).toBeNull();
  });

  it('confirms_pending reconhecido quando há pergunta pendente no contexto', async () => {
    const result = await recognizeDelegatedContactRequest(
      'sim, pode mandar',
      {
        status: 'pending_approval',
        literalContentGate: 'not_applicable',
        recipientName: 'Marina',
        recipientNumberKnown: true,
        pendingConfirmationText: "Vou enviar: 'confirma presença?'. Confirma?",
      },
      {
        modelCall: fakeModelCall({ signal: 'confirms_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null }),
      }
    );
    expect(result.signal).toBe('confirms_pending');
  });

  it('falha total do model (sem modelCall real disponível) -> no_delegation_signal, nunca uma ação', async () => {
    const result = await recognizeDelegatedContactRequest('qualquer coisa', null, {
      modelCall: async () => {
        throw new Error('boom');
      },
      maxRetries: 0,
    });
    expect(result).toEqual({ signal: 'no_delegation_signal', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null, inputTokens: null, outputTokens: null });
  });

  it('parsed null (sem exceção) também cai no fallback fail-closed', async () => {
    const result = await recognizeDelegatedContactRequest('qualquer coisa', null, {
      modelCall: fakeModelCall(null),
      maxRetries: 0,
    });
    expect(result.signal).toBe('no_delegation_signal');
  });

  it('cancels_pending e rejects_pending preservam o signal sem extração', async () => {
    const cancel = await recognizeDelegatedContactRequest('cancela isso', { status: 'pending_approval', literalContentGate: 'not_applicable', recipientName: null, recipientNumberKnown: false, pendingConfirmationText: 'x' }, {
      modelCall: fakeModelCall({ signal: 'cancels_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null }),
    });
    expect(cancel.signal).toBe('cancels_pending');

    const reject = await recognizeDelegatedContactRequest('não, deixa', { status: 'pending_approval', literalContentGate: 'not_applicable', recipientName: null, recipientNumberKnown: false, pendingConfirmationText: 'x' }, {
      modelCall: fakeModelCall({ signal: 'rejects_pending', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null }),
    });
    expect(reject.signal).toBe('rejects_pending');
  });
});
