-- Doopla — liga um booking à oportunidade que o originou.
--
-- Necessário pra "mais de um booker": quando o artista aceita a proposta
-- de um booker pra uma oportunidade, as outras propostas pendentes pra
-- essa mesma oportunidade precisam ser recusadas automaticamente e a
-- oportunidade fechada. Sem essa coluna não dá pra saber quais bookings
-- pertencem à mesma oportunidade.

alter table public.bookings
  add column opportunity_id uuid references public.opportunities (id) on delete set null;

comment on column public.bookings.opportunity_id is 'Preenchido quando o booking nasce de um booker demonstrando interesse numa oportunidade do mural. Nulo = proposta direta.';
