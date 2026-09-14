// Espelha src/lib/supabase/types.ts (Booking/BookingEvent) — cópia
// deliberada, nunca import cruzando pra dentro de src/ do Next.js
// (mesma decisão de profile.ts). Se o schema mudar, os dois lugares
// precisam ser atualizados manualmente.

export type BookingStatus =
  | 'proposta_enviada'
  | 'aceita'
  | 'recusada'
  | 'aguardando_pagamento'
  | 'concluida'
  | 'cancelada';

export type PaymentMode = 'integral_apos_trabalho' | 'sinal_saldo';
export type CancellationInitiator = 'cliente' | 'artista';
export type DisputeStatus = 'nenhuma' | 'em_disputa' | 'chargeback';
export type RequiresInvoice = 'sim' | 'nao' | 'nao_sei';

export type Booking = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  status: BookingStatus;
  proposed_by: 'artista' | 'booker' | 'agencia';
  commission_percent: number;
  cache_amount_cents: number | null;
  description: string | null;
  event_date: string | null;
  validated_at: string | null;
  contract_url: string | null;
  client_name: string | null;
  client_document: string | null;
  event_location: string | null;
  created_at: string;
  updated_at: string;
  payment_mode: PaymentMode;
  deposit_percentage: number | null;
  deposit_due_at: string | null;
  remaining_percentage: number | null;
  remaining_due_rule: string | null;
  client_cancellation_deposit_refundable: boolean;
  artist_cancellation_deposit_refundable: boolean;
  cancellation_policy_version: string;
  cancellation_terms_accepted_at: string | null;
  cancellation_terms_accepted_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_initiator: CancellationInitiator | null;
  cancellation_reason: string | null;
  original_event_date: string | null;
  rescheduled_event_date: string | null;
  rescheduled_at: string | null;
  reschedule_accepted_by: string | null;
  reschedule_proposed_date: string | null;
  reschedule_proposed_by: string | null;
  payment_due_at: string | null;
  payment_collection_started_at: string | null;
  dispute_status: DisputeStatus;
  dispute_opened_at: string | null;
  requires_invoice: RequiresInvoice;
  invoice_payment_term: string | null;
  invoice_terms_accepted_at: string | null;
  invoice_terms_accepted_by: string | null;
  invoice_issued_at: string | null;
  invoice_sent_to_client_at: string | null;
  invoice_client_paid_at: string | null;
  invoice_commission_paid_at: string | null;
};

export type BookingEvent = {
  id: string;
  booking_id: string;
  actor_profile_id: string;
  event_type: string;
  commission_percent: number | null;
  note: string | null;
  created_at: string;
};
