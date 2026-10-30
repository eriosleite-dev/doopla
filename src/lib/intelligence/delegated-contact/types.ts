// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// tipos compartilhados entre o recognizer de pedidos e o
// recipient-consent-check. Nenhum dos dois é o Classifier/Planner —
// shapes deliberadamente próprios, nunca reexportados dos módulos
// principais (mesma disciplina de inbound-proposal/types.ts).

export const DELEGATED_CONTACT_SIGNALS = [
  'no_delegation_signal',
  'new_request',
  'provides_missing_info',
  'confirms_pending',
  'rejects_pending',
  'cancels_pending',
  'status_inquiry',
] as const;
export type DelegatedContactSignal = (typeof DELEGATED_CONTACT_SIGNALS)[number];

// Resumo mínimo do pedido ativo/recente desta profissional, passado
// como contexto pro recognizer — nunca o histórico de conversa
// completo, nunca dados de outra profissional. Só o suficiente pra
// desambiguar "sim"/"enviou?"/um pedido novo não relacionado.
export type ActiveDelegatedContactSummary = {
  status: string;
  literalContentGate: string;
  recipientName: string | null;
  recipientNumberKnown: boolean;
  // Texto exato da pergunta de confirmação pendente (só quando
  // status='pending_approval') — ajuda o model a entender que existe
  // uma pergunta em aberto; a correlação REAL (qual exact
  // confirmation_message_id) é sempre feita em código via claim
  // atômico, nunca por este resumo.
  pendingConfirmationText: string | null;
};

export const RECIPIENT_CONSENT_OUTCOMES = ['proceed', 'declined', 'ambiguous'] as const;
export type RecipientConsentOutcome = (typeof RECIPIENT_CONSENT_OUTCOMES)[number];
