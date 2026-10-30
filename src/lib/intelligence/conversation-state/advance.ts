import type { ConversationStateSnapshot, ConversationStateTurnInput } from './types';

// Doopla Intelligence Core v1 — Conversation State Ledger: avanço
// determinístico do snapshot, um turno real por vez.
//
// Pura, sem I/O, sem chamada a model — só dobra o que o Classifier/
// Planner JÁ decidiram nesta mesma rodada sobre o snapshot anterior.
// Chamada uma vez por turno, em runCycle (pipeline.ts), depois do
// Post-model Policy Gate (decision final, pós-gate).

// Regra de fechamento — DELIBERADAMENTE simples e conservadora pra
// v1: uma mensagem do PARTICIPANTE EXTERNO que só reconhece/agradece
// (responsePlan 'acknowledge', sem tentar criar/mudar compromisso
// nela mesma) fecha TUDO que estava aberto até então. É um sinal
// contundente, não uma prova semântica fina de "fechei exatamente
// este assunto" — avisa o Planner que aquilo foi marcado resolvido
// NESTE momento, nunca trava a reabertura se a pessoa voltar a tocar
// no assunto depois (ver prompt.ts: resolved é indício, não bloqueio).
function turnClosesOpenSubjects(turn: ConversationStateTurnInput): boolean {
  return turn.triggerAuthorType === 'external_participant' && turn.responsePlan === 'acknowledge' && turn.commitmentNature !== 'new_or_changed_commitment';
}

export function advanceConversationStateSnapshot(previous: ConversationStateSnapshot, turn: ConversationStateTurnInput): ConversationStateSnapshot {
  const subjectsByLabel = new Map(previous.subjects.map((s) => [s.label, s]));
  const closesOpenSubjects = turnClosesOpenSubjects(turn);

  if (closesOpenSubjects) {
    for (const subject of subjectsByLabel.values()) {
      if (subject.status === 'open') subject.status = 'resolved';
    }
  }

  const turnLabels = [turn.primaryIntent, ...turn.secondaryIntents];
  for (const label of turnLabels) {
    const existing = subjectsByLabel.get(label);
    if (existing) {
      existing.lastMessageId = turn.triggerMessageId;
      // Um assunto que volta a ser tocado reabre — mesmo que o turno
      // anterior tivesse fechado tudo (ver closesOpenSubjects acima).
      // Reaparecer no intent É a evidência de retomada.
      existing.status = 'open';
    } else {
      subjectsByLabel.set(label, {
        label,
        status: 'open',
        firstMessageId: turn.triggerMessageId,
        lastMessageId: turn.triggerMessageId,
      });
    }
  }

  const knownFactsByCategory = new Map(previous.knownFacts.map((f) => [f.decisionCategory, f]));
  // Só grava/sobrescreve quando o turno de fato CRIA/MUDA o compromisso
  // (commitmentNature === 'new_or_changed_commitment') — nunca quando
  // o turno só RELATA ou PERGUNTA sobre um fato já resolvido
  // (report_existing_fact/not_applicable). Um turno de pergunta/recall
  // ("foi R$3.500 mesmo?") não tem por que conter o valor de novo — se
  // ele sobrescrevesse o ledger, apagaria o único ponteiro real pra
  // mensagem que de fato declarou o valor.
  if (turn.commitmentNature === 'new_or_changed_commitment') {
    for (const category of turn.proposedDecisionCategory) {
      // Sobrescreve sempre — a entrada mais recente É a correção/mudança
      // de decisão (nunca um histórico de versões nesta v1).
      knownFactsByCategory.set(category, {
        decisionCategory: category,
        statedByAuthorType: turn.triggerAuthorType,
        messageId: turn.triggerMessageId,
        evidenceSnippet: turn.triggerMessageSnippet,
      });
    }
  }

  return {
    subjects: [...subjectsByLabel.values()],
    knownFacts: [...knownFactsByCategory.values()],
  };
}
