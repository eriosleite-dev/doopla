import type { ConversationOperationalFacts } from './data';

// Fonte única de agregação de estado de conversas — Home (cards +
// accordion "Precisa de você"), sidebar (badge de Decisões) e
// /dashboard/decisoes NUNCA calculam isto de formas diferentes: todos
// chamam getCachedConversationStateSummary (pro-home-cache.ts), que só
// existe para chamar esta função pura sobre o resultado de
// listConversationOperationalFacts. facts[].state já vem calculado por
// deriveConversationState() dentro de listConversationOperationalFacts
// — nunca recomputado aqui, só contado, pra nunca existir uma segunda
// definição do mesmo critério.
export type ConversationStateSummary = {
  needsYouCount: number;
  waitingClientCount: number;
  inProgressCount: number;
  closedCount: number;
  // Usado pra filtrar listActionableDecisions a um subconjunto
  // GARANTIDAMENTE dentro do que foi contado aqui — nunca uma segunda
  // fonte que pode divergir do número mostrado.
  needsYouConversationIds: string[];
};

export function summarizeConversationStates(
  facts: Pick<ConversationOperationalFacts, 'conversationId' | 'state'>[]
): ConversationStateSummary {
  const summary: ConversationStateSummary = {
    needsYouCount: 0,
    waitingClientCount: 0,
    inProgressCount: 0,
    closedCount: 0,
    needsYouConversationIds: [],
  };

  for (const fact of facts) {
    if (fact.state === 'needs_you') {
      summary.needsYouCount += 1;
      summary.needsYouConversationIds.push(fact.conversationId);
    } else if (fact.state === 'waiting_client') {
      summary.waitingClientCount += 1;
    } else if (fact.state === 'in_progress') {
      summary.inProgressCount += 1;
    } else {
      summary.closedCount += 1;
    }
  }

  return summary;
}
