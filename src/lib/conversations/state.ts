// Doopla Intelligence OS v1 — Conversas Bloco 2: derivação de estado de
// UX a partir dos fatos operacionais crus expostos por
// get_conversation_operational_facts (migration 0060). Função PURA,
// sem I/O — só transforma fatos já lidos em UM dos 4 estados CURRENT
// aprovados pelo usuário: 'needs_you' | 'waiting_client' | 'in_progress'
// | 'closed'.
//
// "Você respondeu" (professional_sent_prepared_response/
// professional_edited_prepared_response) NÃO é um destes 4 estados —
// é um fato de UM evento específico do thread (conversation_messages.
// prepared_response_outcome, migration 0066), lido/exibido pela UI de
// detalhe por mensagem, nunca por esta função.
//
// Contrato: cadeia if/else determinística — cada conversa cai em
// EXATAMENTE um ramo, nunca dois, nunca nenhum (mutuamente exclusivo
// por construção, não por sorte de ordenação de checagens numa lista).
// Duplicado deliberadamente em mobile/src/lib/conversation-state.ts —
// Web (Next.js) e Mobile (Expo/Metro) são bundlers/módulos separados
// nesta base de código, sem grafo de import compartilhado entre eles
// hoje. Qualquer mudança de critério AQUI precisa da MESMA mudança lá,
// nunca um comportamento diferente por superfície.
export type ConversationState = 'needs_you' | 'waiting_client' | 'in_progress' | 'closed';

export type ConversationOperationalFactsForState = {
  status: 'open' | 'closed' | 'archived';
  hasPendingRuntimeReply: boolean;
  lastOutboundIntentDeliveryState: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
};

export function deriveConversationState(facts: ConversationOperationalFactsForState): ConversationState {
  // 1) Encerrada — sempre a prioridade mais alta, independente de
  //    qualquer outro sinal (uma conversa fechada nunca "precisa de
  //    você" nem "aguarda cliente" de novo).
  if (facts.status === 'closed' || facts.status === 'archived') {
    return 'closed';
  }

  // 2) Precisa de você — ou existe uma pendência de retomada aberta
  //    (Approval Engine bloqueado esperando uma decisão do
  //    profissional, runtime_pending_replies status='pending'), ou o
  //    último outbound_intent está em 'policy_allowed' (draft já
  //    autorizado pelo Post-model Gate, mas ainda não enviado — hoje
  //    NENHUM outbound_intent avança sozinho além de policy_allowed,
  //    nenhum worker de auto-send existe, então isto sempre representa
  //    uma ação pendente do profissional).
  if (facts.hasPendingRuntimeReply || facts.lastOutboundIntentDeliveryState === 'policy_allowed') {
    return 'needs_you';
  }

  // 3) Aguardando cliente — a última mensagem do thread foi enviada
  //    (direction='outbound', de ai OU professional, não importa
  //    quem) e não há nada pendente do profissional (ramo 2 já
  //    descartado acima): o próximo movimento é do cliente.
  if (facts.lastMessageDirection === 'outbound') {
    return 'waiting_client';
  }

  // 4) Em andamento — sobra dos outros 3: conversa aberta, sem
  //    pendência do profissional, e a última mensagem (se existir) é
  //    inbound (ou não existe mensagem nenhuma ainda — conversa nova).
  return 'in_progress';
}
