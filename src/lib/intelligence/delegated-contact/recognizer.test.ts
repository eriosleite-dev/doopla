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

  it('soma os tokens de TODAS as tentativas de retry, nunca só a última (achado real, Head of AI 15/10/2026)', async () => {
    let call = 0;
    const result = await recognizeDelegatedContactRequest('qualquer coisa', null, {
      maxRetries: 2,
      modelCall: async (): Promise<DelegatedContactRecognizerModelCallResult> => {
        call++;
        if (call === 1) return { parsed: null, inputTokens: 30, outputTokens: 6 };
        if (call === 2) return { parsed: null, inputTokens: 28, outputTokens: 5 };
        return { parsed: { signal: 'no_delegation_signal', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null }, inputTokens: 25, outputTokens: 4 };
      },
    });
    expect(result.inputTokens).toBe(30 + 28 + 25);
    expect(result.outputTokens).toBe(6 + 5 + 4);
  });

  describe('P0.1 — segurança de identidade (ADR 0005, 16/10/2026)', () => {
    it('backstop bloqueia draftMessageContent que se apresenta como a própria destinatária ("aqui é a Gabi")', async () => {
      const result = await recognizeDelegatedContactRequest(
        'Doopla, manda mensagem pro WhatsApp +55 11 90000-1111, fala que é a Gabi e que mandei beijos.',
        null,
        {
          modelCall: fakeModelCall({
            signal: 'new_request',
            recipientName: 'Gabi',
            recipientNumber: '+5511900001111',
            purposeSummary: 'mandar beijos',
            // Simula o model cometendo exatamente o erro real encontrado
            // na primeira execução do harness (commit bcbc63e) — o
            // backstop precisa pegar isso mesmo que o prompt falhe.
            draftMessageContent: 'Oi! Aqui é a Gabi. A Duda me pediu para te mandar beijos. Beijos!',
          }),
        }
      );
      expect(result.signal).toBe('new_request');
      expect(result.recipientName).toBe('Gabi');
      // Nunca deixa o texto passar — vira null, equivalente a "ainda
      // não tenho o texto definido" (o fluxo real já pergunta de novo
      // nesse caso, sem precisar de nenhum campo novo).
      expect(result.draftMessageContent).toBeNull();
    });

    it('backstop reconhece variações de autoapresentação ("sou a Gabi", "quem fala é a Gabi")', async () => {
      const r1 = await recognizeDelegatedContactRequest('manda pra Gabi', null, {
        modelCall: fakeModelCall({ signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: null, draftMessageContent: 'Oi, sou a Gabi, passando pra avisar que cheguei.' }),
      });
      expect(r1.draftMessageContent).toBeNull();

      const r2 = await recognizeDelegatedContactRequest('manda pra Gabi', null, {
        modelCall: fakeModelCall({ signal: 'new_request', recipientName: 'Gabi', recipientNumber: null, purposeSummary: null, draftMessageContent: 'Oi, quem fala é a Gabi.' }),
      });
      expect(r2.draftMessageContent).toBeNull();
    });

    it('nunca bloqueia um draft legítimo só por mencionar o nome da destinatária em outro contexto', async () => {
      const result = await recognizeDelegatedContactRequest('manda pra Gabi confirmando o show', null, {
        modelCall: fakeModelCall({
          signal: 'new_request',
          recipientName: 'Gabi',
          recipientNumber: null,
          purposeSummary: 'confirmar show',
          draftMessageContent: 'Oi Gabi! Confirmando o show de sábado, pode ser?',
        }),
      });
      // Menciona "Gabi" (vocativo, destinatária sendo chamada), mas
      // nunca se apresenta como ela — não deve disparar o backstop.
      expect(result.draftMessageContent).toBe('Oi Gabi! Confirmando o show de sábado, pode ser?');
    });

    it('texto literal entre aspas é preservado verbatim, mesmo com formatação incomum', async () => {
      const literalText = "confirma presença no evento de sábado?? sem falta viu";
      const result = await recognizeDelegatedContactRequest(`manda pra Marina exatamente isso: "${literalText}"`, null, {
        modelCall: fakeModelCall({ signal: 'new_request', recipientName: 'Marina', recipientNumber: null, purposeSummary: 'confirmar presença', draftMessageContent: literalText }),
      });
      expect(result.draftMessageContent).toBe(literalText);
    });

    it('instrução informal sem recipientName não quebra o backstop (nada pra comparar, passa direto)', async () => {
      const result = await recognizeDelegatedContactRequest('avisa o contato que vou chegar atrasada', null, {
        modelCall: fakeModelCall({ signal: 'new_request', recipientName: null, recipientNumber: null, purposeSummary: 'avisar atraso', draftMessageContent: 'Oi! Só avisando que vou chegar um pouco atrasada.' }),
      });
      expect(result.draftMessageContent).toBe('Oi! Só avisando que vou chegar um pouco atrasada.');
    });
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
