-- Doopla — Limite de 5 novos bookings/mês no plano Doopla (Básico), sem
-- limite no Doopla Pro (fechamento do plano de entitlements de
-- 07/09/2026).
--
-- Definição aprovada: "novo booking que consome o limite mensal" = todo
-- booking criado pra aquele artist_profile_id durante o mês-calendário
-- correspondente ao seu created_at. O consumo acontece na criação —
-- mudança de status depois (recusada/cancelada/concluída) nunca
-- "devolve" a vaga, e não existe carry-over pro mês seguinte. É a regra
-- comercial "até 5 novos bookings/mês", não uma métrica de volume de
-- trabalho processado — por isso conta recusada/cancelada também (senão
-- recusar/cancelar de propósito viraria forma de resetar o contador).
--
-- Auditoria confirmou exatamente 2 pontos reais de INSERT em bookings
-- hoje: proposeBookingAction e selectBookerForOpportunityAction (ambos
-- em src/app/dashboard/actions.ts), nenhum insert de seed/dev/teste em
-- nenhuma migration. Em vez de duplicar o check nos dois Server Actions
-- — arriscando um deles esquecer, ou um terceiro caminho futuro
-- contornar — a decisão fica centralizada numa única function SQL,
-- chamada por uma trigger BEFORE INSERT em bookings: o backend vira
-- autoridade incondicional sobre QUALQUER insert, presente ou futuro,
-- sem lógica duplicada nos entry points. Mesmo padrão já usado em
-- enforce_booker_artist_limit (migration 0032, limite de 1 artista
-- ativo no booker Básico) e enforce_representation_request_limit
-- (migration 0018).
--
-- Gate "é Pro" usa exatamente a mesma expressão já usada em
-- community_profiles_public.is_pro (migration 0059) e em hasDooplaPro()
-- (src/lib/subscription.ts): artist_plan = 'pro' and status = 'active'
-- — nunca reinterpretada aqui (ex.: trialing não conta como Pro pra
-- este gate, igual ao resto do produto).
--
-- pg_advisory_xact_lock antes de contar: sem isso, duas inserções
-- concorrentes pro mesmo artista (ex.: um booker propõe e, no mesmo
-- instante, o artista aceita uma Oportunidade) poderiam ler a mesma
-- contagem e as duas passarem do limite. Não há uma linha única pra dar
-- FOR UPDATE (é um agregado, não uma entidade) — lock por hash da chave
-- lógica é o padrão certo aqui. Colisão de hash entre artistas
-- diferentes só serializa checks sem relação, nunca produz resultado
-- errado (a contagem em si sempre filtra pelo artist_profile_id certo).

create or replace function public.assert_artist_booking_monthly_limit(p_artist_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_pro boolean;
  v_month_start timestamptz;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('artist_booking_monthly_limit:' || p_artist_profile_id::text));

  select coalesce(artist_plan = 'pro' and status = 'active', false) into v_is_pro
  from public.subscriptions
  where profile_id = p_artist_profile_id and role = 'artista';

  if v_is_pro then
    return;
  end if;

  v_month_start := date_trunc('month', now());

  select count(*) into v_count
  from public.bookings
  where artist_profile_id = p_artist_profile_id
    and created_at >= v_month_start
    and created_at < v_month_start + interval '1 month';

  if v_count >= 5 then
    raise exception 'artist_booking_monthly_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_artist_booking_monthly_limit(uuid) is 'Fonte única da regra "até 5 novos bookings/mês no Doopla Básico, ilimitado no Pro" — chamada pela trigger artist_booking_monthly_limit_check em bookings (cobre todo INSERT, qualquer entry point atual ou futuro).';

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

create trigger artist_booking_monthly_limit_check
  before insert on public.bookings
  for each row execute function public.enforce_artist_booking_monthly_limit();
