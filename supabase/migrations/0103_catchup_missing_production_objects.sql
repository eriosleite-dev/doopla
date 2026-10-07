-- Catch-up de objetos que já existiam no histórico de migrations deste
-- repositório mas nunca tinham sido aplicados em produção (07/10/2026).
--
-- Contexto: este projeto nunca usou rastreamento formal de migrations
-- (confirmado: `supabase_migrations.schema_migrations` não existe em
-- produção) — toda aplicação sempre foi manual, migration por migration,
-- via SQL Editor. Um achado real da fundadora (`updateProfileAndWorkContextAction`
-- falhando com "Não foi possível salvar agora.") revelou, ao investigar o
-- log do Postgres, que `artist_profiles.what_you_do` não existia em
-- produção — a migration 0080 nunca tinha rodado lá, embora o código já
-- dependesse dela há semanas. Isso motivou uma auditoria completa:
-- comparar toda tabela/coluna/função esperada (extraída de todos os 102
-- migrations até aqui) contra o schema real de produção. Resultado: só
-- mais 2 gaps, nenhum outro.
--
-- Esta migration não cria nada NOVO — só re-expressa, de forma
-- idempotente (`if not exists`/`create or replace`/`drop ... if exists`),
-- o que as migrations originais (0080, 0013, 0073/0074) já deveriam ter
-- deixado em qualquer ambiente. Segura de rodar em qualquer banco,
-- independente do que já existe nele.

-- 1) artist_profiles.what_you_do / where_you_serve (migration 0080) —
-- causa raiz do bug "Não foi possível salvar agora." em
-- /dashboard/perfil/dados.
alter table public.artist_profiles
  add column if not exists what_you_do text,
  add column if not exists where_you_serve text;

comment on column public.artist_profiles.what_you_do is 'Texto livre: "o que você faz e para quem" — substitui work_types/client_types na UI do beta (Settings V2, 14/09/2026). Conhecimento declarado pro Intelligence Context, nunca autorização.';
comment on column public.artist_profiles.where_you_serve is 'Texto livre: "onde você atende" — substitui regions na UI do beta (Settings V2, 14/09/2026). Conhecimento declarado pro Intelligence Context, nunca autorização.';

-- 2) bookings.contract_url (migration 0013) — usado em 6+ pontos do
-- código (anexar/mostrar link de contrato); as escritas ignoravam erro
-- silenciosamente, então esse gap nunca gerou um erro visível pra
-- ninguém, só um contrato que nunca ficava salvo.
alter table public.bookings add column if not exists contract_url text;
comment on column public.bookings.contract_url is 'Link do contrato (Google Doc, PDF etc). Nulo = sem contrato anexado ainda.';

-- 3) Trigger de limite de 5 bookings/mês no plano Básico (migration
-- 0073, função atualizada por 0074) — a função `assert_artist_booking_monthly_limit`
-- existia (0074 a recria por conta própria), mas a função-wrapper da
-- trigger e a trigger em si só existiam na 0073 original, que nunca
-- rodou. Resultado real: o limite de 5 bookings/mês não estava sendo
-- aplicado em produção. Recria só a trigger, chamando a versão JÁ
-- canônica de `assert_artist_booking_monthly_limit` (a de 0074, que usa
-- `artist_has_doopla_pro` em vez da expressão inline antiga) — nunca
-- reverte pra versão anterior dessa função.
create or replace function public.enforce_artist_booking_monthly_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_artist_booking_monthly_limit(new.artist_profile_id);
  return new;
end;
$$;

drop trigger if exists artist_booking_monthly_limit_check on public.bookings;
create trigger artist_booking_monthly_limit_check
  before insert on public.bookings
  for each row execute function public.enforce_artist_booking_monthly_limit();
