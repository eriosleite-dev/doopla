// Doopla Mobile — Conversas Bloco 2: derivação de estado de UX a
// partir dos fatos operacionais crus expostos por
// get_conversation_operational_facts (migration 0060). Função PURA,
// sem I/O.
//
// ESPELHO DELIBERADO de src/lib/conversations/state.ts (painel web) —
// Web (Next.js) e Mobile (Expo/Metro) são bundlers/módulos separados
// nesta base de código, sem grafo de import compartilhado entre eles
// hoje, então a mesma lógica precisa existir nos dois lugares. Qualquer
// mudança de critério LÁ precisa da MESMA mudança aqui, nunca um
// comportamento diferente por superfície.
//
// "Você respondeu" (professional_sent_prepared_response/
// professional_edited_prepared_response) NÃO é um destes 4 estados —
// é um fato de UM evento específico do thread (conversation_messages.
// prepared_response_outcome, migration 0066), lido/exibido pela tela
// de detalhe por mensagem, nunca por esta função.
export type ConversationState = 'needs_you' | 'waiting_client' | 'in_progress' | 'closed';

export type ConversationOperationalFactsForState = {
  status: 'open' | 'closed' | 'archived';
  hasPendingRuntimeReply: boolean;
  lastOutboundIntentDeliveryState: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
};

export function deriveConversationState(facts: ConversationOperationalFactsForState): ConversationState {
  // 1) Encerrada — prioridade mais alta, independente de qualquer
  //    outro sinal.
  if (facts.status === 'closed' || facts.status === 'archived') {
    return 'closed';
  }

  // 2) Precisa de você — pendência de retomada aberta OU último
  //    outbound_intent em 'policy_allowed' (draft autorizado, ainda
  //    não enviado — hoje nenhum outbound_intent avança sozinho além
  //    disso, nenhum worker de auto-send existe).
  if (facts.hasPendingRuntimeReply || facts.lastOutboundIntentDeliveryState === 'policy_allowed') {
    return 'needs_you';
  }

  // 3) Aguardando cliente — última mensagem enviada (direction=
  //    'outbound', de ai OU professional) e nada pendente do
  //    profissional (ramo 2 já descartado).
  if (facts.lastMessageDirection === 'outbound') {
    return 'waiting_client';
  }

  // 4) Em andamento — sobra dos outros 3.
  return 'in_progress';
}
