import { formatPercent } from '@/lib/format';

// Lógica pura compartilhada entre LegacyBookingDetailView (Booker,
// tema antigo intocado) e ProBookingDetailView (artista/agência, novo
// tema --pro-*) — re-skin do Booking Detail (Bloco 7, P1). Extraído
// literalmente do page.tsx original: nenhuma regra de negócio mudou,
// só passou a viver num lugar só pra nunca as duas views divergirem
// (mesma lição do bug 17≠20 corrigido no P0).

export function paymentPolicySummary(booking: {
  payment_mode: string;
  deposit_percentage: number | null;
  remaining_due_rule: string | null;
  client_cancellation_deposit_refundable: boolean;
  artist_cancellation_deposit_refundable: boolean;
}): string[] {
  const lines: string[] = [];
  if (booking.payment_mode === 'sinal_saldo' && booking.deposit_percentage != null) {
    lines.push(
      `Sinal de ${formatPercent(booking.deposit_percentage)}, saldo ${
        booking.remaining_due_rule ? `vence ${booking.remaining_due_rule}` : 'combinado à parte'
      }.`
    );
  } else {
    lines.push('100% do pagamento ocorre após o trabalho.');
  }
  lines.push(
    booking.client_cancellation_deposit_refundable
      ? 'Se o cliente cancelar, o sinal é reembolsável a ele.'
      : 'Se o cliente cancelar, o sinal não é reembolsável.'
  );
  lines.push(
    booking.artist_cancellation_deposit_refundable
      ? 'Se o artista cancelar, o cliente tem direito ao sinal de volta.'
      : 'Se o artista cancelar, o sinal não é devolvido ao cliente.'
  );
  return lines;
}

export type PaymentDueState = 'a_vencer' | 'vencido' | 'em_cobranca';

export function paymentDueState(booking: {
  payment_due_at: string | null;
  payment_collection_started_at: string | null;
}): PaymentDueState | null {
  if (!booking.payment_due_at) return null;
  if (booking.payment_collection_started_at) return 'em_cobranca';
  return new Date(booking.payment_due_at).getTime() < Date.now() ? 'vencido' : 'a_vencer';
}

export const PAYMENT_DUE_LABELS: Record<PaymentDueState, string> = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  em_cobranca: 'Em cobrança',
};

export const DISPUTE_LABELS: Record<string, string> = {
  em_disputa: 'Em disputa',
  chargeback: 'Chargeback aberto',
};

// Etapas do faturamento direto (LOTE 2 Parte 2, item 18) — computadas a
// partir dos timestamps do booking, mesmo padrão de "A vencer/Vencido"
// já usado acima. Nunca um status global novo.
export function invoiceStages(booking: {
  invoice_terms_accepted_at: string | null;
  invoice_issued_at: string | null;
  invoice_sent_to_client_at: string | null;
  invoice_client_paid_at: string | null;
  invoice_commission_paid_at: string | null;
}) {
  return [
    { key: 'aceite', label: 'Condições aceitas', done: booking.invoice_terms_accepted_at != null },
    { key: 'emitida', label: 'NF emitida', done: booking.invoice_issued_at != null },
    { key: 'enviada', label: 'Enviada ao cliente', done: booking.invoice_sent_to_client_at != null },
    { key: 'recebida', label: 'Pagamento recebido', done: booking.invoice_client_paid_at != null },
    { key: 'comissao', label: 'Comissão paga', done: booking.invoice_commission_paid_at != null },
  ];
}
