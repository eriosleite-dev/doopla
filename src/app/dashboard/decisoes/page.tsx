import { redirect } from 'next/navigation';

// SUPERSEDED como área própria (auditoria de legado, 15/09/2026,
// decisão canônica da fundadora) — a tela nunca tinha capacidade
// própria de resolução: todo CTA navegava pra dentro de uma conversa
// (a auditoria confirmou isso lendo o código). "Precisa de você" já
// aparece, com a MESMA fonte (runtime_pending_replies/outbound_intents
// via deriveConversationState/resolveDooplaIntervention), em Home,
// badge de Bookings, Bookings e Pedido Detail — nada disso foi tocado.
// "Resolvidas" (histórico) não é apagado — os dados
// (runtime_pending_replies completed/superseded,
// conversation_messages.replied_to_outbound_intent_id) continuam
// intactos; a direção futura é esse histórico aparecer dentro do
// contexto do trabalho/conversa, não implementada nesta rodada.
// Preservados, sem chamador aqui: ProDecisoesView, format-cards.ts,
// decisoes/actions.ts, list_actionable_decisions_page/
// list_resolved_decisions_page (RPCs) — mesmo padrão de rota órfã já
// usado em outras rodadas desta sessão, nunca apagar infraestrutura.
export default function DecisoesRedirectPage() {
  redirect('/dashboard');
}
