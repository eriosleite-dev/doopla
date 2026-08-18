-- LOTE 2 Parte 2 — Trabalhos que exigem Nota Fiscal (pagamento direto
-- artista↔cliente, fora do split da Doopla). Ver DECISOES.md pra racional
-- completo e ADENDO — PUBLICAÇÃO DE TRABALHO COM NOTA FISCAL.
--
-- Reaproveita opportunities/bookings existentes — nada de tabela nova,
-- tipo de usuário novo ou "AgencyBooking"/"NFBooking". Segue o mesmo
-- padrão de checkpoints por timestamp já usado em cancelamento/reembolso
-- (migration 0024) em vez de um status global novo.

alter table public.opportunities
  add column requires_invoice text not null default 'nao'
    check (requires_invoice in ('sim', 'nao', 'nao_sei'));

comment on column public.opportunities.requires_invoice is 'Escolha do artista na publicação: Sim/Não/Ainda não sei. "nao_sei" existe só aqui — o booking criado a partir da oportunidade precisa herdar esse valor e só é resolvido quando o Booker/artista souber.';

alter table public.bookings
  add column requires_invoice text not null default 'nao'
    check (requires_invoice in ('sim', 'nao', 'nao_sei')),
  add column invoice_payment_term text,
  add column invoice_terms_accepted_at timestamptz,
  add column invoice_terms_accepted_by uuid references public.profiles (id) on delete set null,
  add column invoice_issued_at timestamptz,
  add column invoice_sent_to_client_at timestamptz,
  add column invoice_client_paid_at timestamptz,
  add column invoice_commission_paid_at timestamptz;

comment on column public.bookings.requires_invoice is 'Sim = pagamento direto artista↔cliente, Doopla só acompanha (não processa, não protege). Fixado na criação do booking (proposta ou seleção de booker a partir de oportunidade), igual payment_mode — não editável depois de criado nessa v1.';
comment on column public.bookings.invoice_payment_term is 'Texto livre definido pelo Booker durante a negociação (ex: "30 dias após emissão da NF"). NULL = "A confirmar" — nunca assumir 30 dias como padrão.';
comment on column public.bookings.invoice_terms_accepted_at is 'Aceite explícito do Booker das condições do trabalho com NF, capturado no mesmo aceite da proposta (respondBookingAction) quando requires_invoice = sim.';
comment on column public.bookings.invoice_issued_at is 'Artista marca que emitiu a NF. Doopla não emite nem valida — só registra.';
comment on column public.bookings.invoice_sent_to_client_at is 'Artista marca que enviou a NF ao cliente.';
comment on column public.bookings.invoice_client_paid_at is 'Artista confirma que recebeu o pagamento direto do cliente — a partir daqui a comissão do Booker fica "pendente".';
comment on column public.bookings.invoice_commission_paid_at is 'Artista confirma que pagou a comissão ao Booker diretamente (fora do split da Doopla) — fecha o booking (status concluida).';
