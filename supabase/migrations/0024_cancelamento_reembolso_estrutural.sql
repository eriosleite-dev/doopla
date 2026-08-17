-- Doopla — Bloco C prioridade 2: cancelamento/reembolso, parte estrutural
-- (doopla-cancelamento-reembolso-rascunho.md, v2 — "reescrito para split +
-- repasse imediato").
--
-- Escopo combinado com a usuária: só modelo de dados/snapshot e linguagem
-- no painel. Nada aqui simula repasse real de PSP — a doopla ainda não tem
-- integração de verdade com o Pagar.me, "Marcar como pago" continua um
-- registro manual, igual já era antes desta migration.
--
-- Travado, fora deste escopo (lista do próprio documento, aguardando
-- validação jurídica/PSP): mecanismo exato de divisão da dívida entre
-- artista e booker, janela de segurança antes do repasse acontecer de
-- fato, valor exato do MDR retido em chargeback, desenho de UI de saldo
-- devedor. Nenhum desses 4 pontos é implementado aqui.

alter type public.booking_status add value if not exists 'cancelada';

alter table public.bookings
  -- Forma de pagamento (Especificação de cancelamento, "Formas de
  -- pagamento no booking"). "Personalizado" fica fora do MVP.
  add column payment_mode text not null default 'integral_apos_trabalho'
    check (payment_mode in ('integral_apos_trabalho', 'sinal_saldo')),
  add column deposit_percentage numeric(5,2)
    check (deposit_percentage is null or (deposit_percentage >= 0 and deposit_percentage <= 100)),
  add column deposit_due_at timestamptz,
  add column remaining_percentage numeric(5,2)
    check (remaining_percentage is null or (remaining_percentage >= 0 and remaining_percentage <= 100)),
  add column remaining_due_rule text,

  -- Snapshot da política de cancelamento aceita nesta proposta específica
  -- (nunca uma referência viva a uma política que pode mudar depois).
  add column client_cancellation_deposit_refundable boolean not null default true,
  add column artist_cancellation_deposit_refundable boolean not null default true,
  add column cancellation_policy_version text not null default 'v1',

  -- Consentimento explícito. Ainda não existe uma "tela de pagamento do
  -- sinal" de verdade (sem PSP real) — captura no touchpoint real mais
  -- próximo disso, que é o momento em que a proposta é aceita.
  add column cancellation_terms_accepted_at timestamptz,
  add column cancellation_terms_accepted_by uuid references public.profiles (id) on delete set null,

  -- Cancelamento em si.
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancellation_initiator text check (cancellation_initiator in ('cliente', 'artista')),
  add column cancellation_reason text,

  -- Remarcação consensual — distinta de cancelamento, o booking continua.
  add column original_event_date date,
  add column rescheduled_event_date date,
  add column rescheduled_at timestamptz,
  add column reschedule_accepted_by uuid references public.profiles (id) on delete set null,
  add column reschedule_proposed_date date,
  add column reschedule_proposed_by uuid references public.profiles (id) on delete set null,

  -- Inadimplência é fluxo próprio, não é cancelamento nem disputa. Sem
  -- cobrança automática — o vencimento só alimenta o rótulo no painel.
  add column payment_due_at timestamptz,
  add column payment_collection_started_at timestamptz,

  -- Disputa/chargeback: sempre separado de cancelamento no produto.
  add column dispute_status text not null default 'nenhuma'
    check (dispute_status in ('nenhuma', 'em_disputa', 'chargeback')),
  add column dispute_opened_at timestamptz;

comment on column public.bookings.payment_mode is '100% após o trabalho, ou sinal + saldo. "Personalizado" fora do MVP.';
comment on column public.bookings.deposit_percentage is 'Só usado quando payment_mode = sinal_saldo.';
comment on column public.bookings.client_cancellation_deposit_refundable is 'Se o cliente cancela, o sinal (já pago) é reembolsável a ele? Snapshot aceito nesta proposta, não referência viva a uma política que pode mudar.';
comment on column public.bookings.artist_cancellation_deposit_refundable is 'Se o artista cancela, o cliente tem direito ao sinal de volta. Mantido como campo separado do de cima de propósito — não presumir simetria entre os dois casos.';
comment on column public.bookings.cancellation_policy_version is 'Referência só pra auditoria — as condições que realmente valem são os campos acima, snapshotados no momento da proposta.';
comment on column public.bookings.cancellation_terms_accepted_at is 'Consentimento explícito às condições de cancelamento. Capturado no aceite da proposta (touchpoint real mais próximo do momento de pagamento, já que ainda não existe PSP real).';
comment on column public.bookings.cancellation_initiator is 'cliente = cliente final desistiu (artista/booker registra em nome dele); artista = o próprio artista cancelou o show. Sem valor "booker": o documento é explícito que o booker não cancela unilateralmente um booking já confirmado.';
comment on column public.bookings.reschedule_proposed_date is 'Remarcação proposta por uma das partes, aguardando aceite da outra. Enquanto pendente, o booking e event_date originais continuam valendo.';
comment on column public.bookings.payment_due_at is 'Vencimento do pagamento restante, opcional. Quando preenchido, alimenta o rótulo A vencer/Vencido no painel — não dispara nenhuma cobrança automática (sem PSP real ainda).';
comment on column public.bookings.dispute_status is 'Disputa/chargeback é sempre um fluxo separado de cancelamento, nunca a mesma coisa. Sinalização apenas — sem execução financeira (o MDR retido em chargeback segue travado, depende do contrato de credenciamento).';
