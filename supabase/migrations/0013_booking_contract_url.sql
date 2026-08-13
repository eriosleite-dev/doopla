-- Doopla — Contratos: anexar um link de contrato ao booking (Google Doc,
-- PDF etc). Sem geração nem assinatura eletrônica de verdade ainda, isso
-- fica fora de escopo por enquanto — só um lugar oficial pra guardar o
-- link do que já foi combinado fora da doopla.
--
-- Verified, contrato e pagamento são estados separados (regra do Bloco
-- E): contract_url não afeta validated_at nem status do booking.

alter table public.bookings
  add column contract_url text;

comment on column public.bookings.contract_url is 'Link do contrato (Google Doc, PDF etc). Nulo = sem contrato anexado ainda.';
