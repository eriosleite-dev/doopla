-- Doopla — Bloco D: base pros 5 checkpoints do card de trabalho
-- (Cliente / Cachê / Data / Validado / Pagamento).
--
-- Cliente, Cachê e Pagamento já são deriváveis do que existe (status,
-- cache_amount_cents). Só faltam dois campos novos:
-- - event_date: data do trabalho (checkpoint "Data").
-- - validated_at: cliente confirmou as condições pelo link de validação
--   (checkpoint "Validado" / Doopla Verified). O link em si é Bloco E —
--   por enquanto essa coluna só existe pra já nascer certa quando o Bloco
--   E chegar, sem precisar de outra migration pra isso.

alter table public.bookings
  add column event_date date,
  add column validated_at timestamptz;

comment on column public.bookings.event_date is 'Data do trabalho. Nulo = checkpoint "Data" pendente.';
comment on column public.bookings.validated_at is 'Quando o cliente confirmou as condições pelo link de validação (Bloco E). Nulo = "Aguardando validação".';
