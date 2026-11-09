import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — "Dados de recebimento" saiu de
// Configurações (auditoria de Financeiro): Financeiro
// (/dashboard/dinheiro) passou a ser a ÚNICA superfície canônica pra
// esse formulário, que já vivia lá também (mesmo PaymentDetailsFields/
// setPaymentDetailsAction/RPC set_payment_details, migration 0046 —
// nenhum deles tocado). Sem conteúdo próprio que ainda faça sentido,
// essa rota vira redirect.
export default function RecebimentoRedirectPage() {
  redirect('/dashboard/dinheiro');
}
