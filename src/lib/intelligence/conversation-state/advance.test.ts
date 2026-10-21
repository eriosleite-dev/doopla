import { describe, expect, it } from 'vitest';

import { advanceConversationStateSnapshot } from './advance';
import { EMPTY_CONVERSATION_STATE_SNAPSHOT } from './types';
import type { ConversationStateTurnInput } from './types';

// Doopla Intelligence Core v1 — Conversation State Ledger: testes
// unitários de advanceConversationStateSnapshot, espelhando os 3
// achados reais documentados na rodada de baseline (40 turnos reais,
// zero erro de API) das 3 cenários novas do laboratório de conversas —
// cada teste aqui é o que o snapshot PRECISA conter pra o Planner ter
// o atalho que faltou naquele turno real.

function turn(overrides: Partial<ConversationStateTurnInput>): ConversationStateTurnInput {
  return {
    triggerMessageId: 'msg-default',
    triggerAuthorType: 'external_participant',
    triggerMessageSnippet: 'texto padrão',
    primaryIntent: 'outro',
    secondaryIntents: [],
    proposedDecisionCategory: [],
    commitmentNature: 'not_applicable',
    responsePlan: 'no_response_needed',
    ...overrides,
  };
}

describe('advanceConversationStateSnapshot', () => {
  it('achado real 1 (preço) — profissional decide um preço, o snapshot grava o fato com o trecho verbatim', () => {
    const afterDecision = advanceConversationStateSnapshot(
      EMPTY_CONVERSATION_STATE_SNAPSHOT,
      turn({
        triggerMessageId: 'msg-5',
        triggerAuthorType: 'professional',
        triggerMessageSnippet: 'Pode fechar o casamento por R$3.500 se ela confirmar até sexta.',
        primaryIntent: 'orcamento',
        proposedDecisionCategory: ['price_or_cache'],
        commitmentNature: 'new_or_changed_commitment',
        responsePlan: 'consult_professional',
      })
    );

    expect(afterDecision.knownFacts).toEqual([
      {
        decisionCategory: 'price_or_cache',
        statedByAuthorType: 'professional',
        messageId: 'msg-5',
        evidenceSnippet: 'Pode fechar o casamento por R$3.500 se ela confirmar até sexta.',
      },
    ]);

    // Turno seguinte: cliente só CONFIRMA/PERGUNTA sobre o mesmo
    // fato — nunca pode apagar o ponteiro pra mensagem que de fato
    // declarou o valor.
    const afterConfirmation = advanceConversationStateSnapshot(
      afterDecision,
      turn({
        triggerMessageId: 'msg-6',
        triggerAuthorType: 'external_participant',
        triggerMessageSnippet: 'Perfeito, fechado! Só confirma: foi R$3.500 mesmo?',
        primaryIntent: 'orcamento',
        proposedDecisionCategory: ['price_or_cache'],
        commitmentNature: 'report_existing_fact',
        responsePlan: 'answer_with_known_information',
      })
    );

    expect(afterConfirmation.knownFacts).toEqual(afterDecision.knownFacts);
  });

  it('achado real 2 (desconto) — fato de 9+ turnos atrás permanece no snapshot (não depende da janela de mensagens)', () => {
    const afterDiscountDecision = advanceConversationStateSnapshot(
      EMPTY_CONVERSATION_STATE_SNAPSHOT,
      turn({
        triggerMessageId: 'msg-early',
        triggerAuthorType: 'professional',
        triggerMessageSnippet: 'Pode aceitar os 10% à vista.',
        primaryIntent: 'desconto',
        proposedDecisionCategory: ['discount'],
        commitmentNature: 'new_or_changed_commitment',
        responsePlan: 'consult_professional',
      })
    );

    // Simula vários turnos neutros depois (outro assunto, sem
    // nenhuma menção a desconto) — o fato precisa sobreviver.
    let snapshot = afterDiscountDecision;
    for (let i = 0; i < 8; i++) {
      snapshot = advanceConversationStateSnapshot(
        snapshot,
        turn({ triggerMessageId: `msg-filler-${i}`, primaryIntent: 'logistica', commitmentNature: 'not_applicable', responsePlan: 'acknowledge' })
      );
    }

    const discountFact = snapshot.knownFacts.find((f) => f.decisionCategory === 'discount');
    expect(discountFact).toEqual({
      decisionCategory: 'discount',
      statedByAuthorType: 'professional',
      messageId: 'msg-early',
      evidenceSnippet: 'Pode aceitar os 10% à vista.',
    });
  });

  it('achado real 3 (reabertura) — "obrigada, tudo certo" fecha os assuntos abertos; retomada explícita reabre', () => {
    const afterNegotiation = advanceConversationStateSnapshot(
      EMPTY_CONVERSATION_STATE_SNAPSHOT,
      turn({ triggerMessageId: 'msg-1', primaryIntent: 'condicao_pagamento', commitmentNature: 'new_or_changed_commitment', proposedDecisionCategory: ['payment_condition'] })
    );
    expect(afterNegotiation.subjects).toEqual([{ label: 'condicao_pagamento', status: 'open', firstMessageId: 'msg-1', lastMessageId: 'msg-1' }]);

    const afterClosing = advanceConversationStateSnapshot(
      afterNegotiation,
      turn({
        triggerMessageId: 'msg-closing',
        triggerAuthorType: 'external_participant',
        triggerMessageSnippet: 'Ótimo, está tudo certo. Obrigada!',
        primaryIntent: 'outro',
        commitmentNature: 'not_applicable',
        responsePlan: 'acknowledge',
      })
    );

    expect(afterClosing.subjects).toEqual([
      { label: 'condicao_pagamento', status: 'resolved', firstMessageId: 'msg-1', lastMessageId: 'msg-1' },
      { label: 'outro', status: 'open', firstMessageId: 'msg-closing', lastMessageId: 'msg-closing' },
    ]);

    // Retomada explícita do mesmo assunto depois — reabre, nunca
    // trava permanentemente fechado.
    const afterReopen = advanceConversationStateSnapshot(
      afterClosing,
      turn({ triggerMessageId: 'msg-reopen', primaryIntent: 'condicao_pagamento', commitmentNature: 'not_applicable', responsePlan: 'ask_external_participant' })
    );
    const reopened = afterReopen.subjects.find((s) => s.label === 'condicao_pagamento');
    expect(reopened?.status).toBe('open');
  });

  it('turno com múltiplos assuntos simultâneos (primaryIntent + secondaryIntents) abre os dois', () => {
    const snapshot = advanceConversationStateSnapshot(
      EMPTY_CONVERSATION_STATE_SNAPSHOT,
      turn({ triggerMessageId: 'msg-1', primaryIntent: 'orcamento', secondaryIntents: ['disponibilidade'] })
    );
    expect(snapshot.subjects.map((s) => s.label).sort()).toEqual(['disponibilidade', 'orcamento']);
  });

  it('acknowledge que é, ele mesmo, um novo compromisso (commitmentNature new_or_changed_commitment) não fecha nada', () => {
    const afterOpen = advanceConversationStateSnapshot(EMPTY_CONVERSATION_STATE_SNAPSHOT, turn({ triggerMessageId: 'msg-1', primaryIntent: 'desconto' }));
    const afterAck = advanceConversationStateSnapshot(
      afterOpen,
      turn({ triggerMessageId: 'msg-2', triggerAuthorType: 'external_participant', responsePlan: 'acknowledge', commitmentNature: 'new_or_changed_commitment' })
    );
    expect(afterAck.subjects.find((s) => s.label === 'desconto')?.status).toBe('open');
  });

  it('acknowledge do PRÓPRIO profissional não fecha nada (só participante externo fecha, ver comentário em advance.ts)', () => {
    const afterOpen = advanceConversationStateSnapshot(EMPTY_CONVERSATION_STATE_SNAPSHOT, turn({ triggerMessageId: 'msg-1', primaryIntent: 'desconto' }));
    const afterAck = advanceConversationStateSnapshot(afterOpen, turn({ triggerMessageId: 'msg-2', triggerAuthorType: 'professional', responsePlan: 'acknowledge' }));
    expect(afterAck.subjects.find((s) => s.label === 'desconto')?.status).toBe('open');
  });
});
