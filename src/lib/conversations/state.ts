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
  // requires_professional_review (migration 0083/0098) — ver
  // isOutboundDraftAwaitingProfessionalReview abaixo. null só ocorre
  // quando não existe outbound_intent nenhum (mesmo caso de
  // lastOutboundIntentDeliveryState null).
  lastOutboundIntentRequiresReview: boolean | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
};

// Regra canônica única de "draft retido exige ação do profissional"
// (fechamento do bloco requires_professional_review, 01/10/2026):
// policy_allowed sozinho NUNCA significa "precisa de você" — é o
// estado de QUALQUER outbound_intent entre ser criado e ser enviado
// pelo cron (send-outbound-intents, 1×/min), inclusive os que vão sair
// sozinhos em segundos. Só quando o Planner marcou
// requires_professional_review=true (migration 0083) é que
// list_claimable_outbound_intents/claim_outbound_intent_for_send
// nunca reclamam a linha — aí sim é retenção de verdade.
//
// Exportada de propósito: é a MESMA pergunta booleana que
// listActionableDecisions()/getPendingDraftForConversation()
// (decisions/data.ts, conversations/data.ts) precisam responder sobre
// uma linha de outbound_intents — nenhuma das duas reimplementa a
// condição, todas chamam esta function. O equivalente em SQL
// (list_actionable_decisions_page, migration 0070, hoje órfã mas
// corrigida) é public.outbound_intent_needs_professional_review —
// mesma regra, SQL não pode importar TS, mas os comentários se
// referenciam um ao outro pra nunca divergir sem ninguém perceber.
export function isOutboundDraftAwaitingProfessionalReview(
  deliveryState: string | null,
  requiresReview: boolean | null
): boolean {
  return deliveryState === 'policy_allowed' && requiresReview === true;
}

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
  //    outbound_intent mais recente está genuinamente retido
  //    (isOutboundDraftAwaitingProfessionalReview acima — nunca mais
  //    só policy_allowed). Correção 01/10/2026 do gap documentado em
  //    15/09 (Sessão Central): antes, qualquer policy_allowed disparava
  //    needs_you, inclusive drafts que o cron ia mandar sozinho em
  //    segundos. Agora só dispara quando requires_professional_review
  //    também é true — a mesma condição que já protege o envio
  //    automático (migration 0083), finalmente espelhada aqui.
  if (
    facts.hasPendingRuntimeReply ||
    isOutboundDraftAwaitingProfessionalReview(facts.lastOutboundIntentDeliveryState, facts.lastOutboundIntentRequiresReview)
  ) {
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
