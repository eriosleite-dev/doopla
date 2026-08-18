-- Doopla — Booker Básico/Pro como plano real (não texto solto).
--
-- Infraestrutura completa: plano real (basic/pro), gate de permissão
-- consultado sempre pelo estado atual (nunca "já foi Pro alguma vez"),
-- e a primeira diferenciação real entre os planos: 1 artista ativo no
-- Básico, ilimitado no Pro. Nenhum outro recurso do Básico foi tocado
-- — Trabalhos, Agenda, Oportunidades, Dinheiro, Meus Artistas continuam
-- 100% iguais nos dois planos.
--
-- Sem processador de pagamento real ainda: "confirmar upgrade" grava
-- esse estado (mesmo estágio do resto do produto). pro_period_ends_at
-- é uma aproximação de ciclo mensal (30 dias a partir do upgrade) —
-- quando existir cobrança recorrente de verdade, passa a vir de lá.

alter table public.subscriptions
  add column booker_plan text not null default 'basic' check (booker_plan in ('basic', 'pro')),
  add column active_artist_profile_id uuid references public.profiles (id) on delete set null,
  add column active_artist_pending_choice boolean not null default false,
  add column pro_period_ends_at date;

comment on column public.subscriptions.booker_plan is 'Plano real do booker — toda checagem de acesso consulta este campo + status, nunca histórico ("já foi Pro").';
comment on column public.subscriptions.active_artist_profile_id is 'No plano Básico, o único artista operacional pra novas operações (bookings/negociações novas). Null = sem restrição (Pro, ou Básico sem artista selecionado ainda).';
comment on column public.subscriptions.active_artist_pending_choice is 'True logo após um downgrade Pro->Básico automático — o booker pode trocar a escolha uma única vez na primeira entrada. Vira false depois que ele confirma ou troca.';
comment on column public.subscriptions.pro_period_ends_at is 'Fim do ciclo pago do Pro. Cancelar não derruba o Pro na hora — o downgrade automático só acontece quando essa data passa (expire_booker_pro_subscriptions).';

-- 1 artista ativo por vez no Básico: garante a regra mesmo se alguma
-- Server Action esquecer de checar antes (mesmo espírito de
-- enforce_representation_request_limit, migration 0018).
create function public.enforce_booker_artist_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan text;
  v_count integer;
begin
  select booker_plan into v_plan
  from public.subscriptions
  where profile_id = new.booker_profile_id;

  if v_plan = 'basic' then
    select count(*) into v_count
    from public.representations
    where booker_profile_id = new.booker_profile_id;

    if v_count >= 1 then
      raise exception 'booker_basic_artist_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger booker_artist_limit_check
  before insert on public.representations
  for each row execute function public.enforce_booker_artist_limit();

-- Sweep chamado sob demanda (mesmo padrão de
-- expire_stale_representation_requests) antes de ler plano/agenda do
-- booker: se o ciclo pago do Pro já passou, efetiva o downgrade e
-- escolhe automaticamente qual artista fica ativo, por prioridade —
-- 1) booking/trabalho em andamento mais recentemente atualizado,
-- 2) sem isso, o booking mais recente de qualquer status,
-- 3) sem isso, o vínculo (representations) mais recente.
-- Os demais artistas continuam com vínculo/histórico intactos, só
-- ficam bloqueados pra operações NOVAS (checagem fica na aplicação —
-- bookings já em andamento não são afetados por esse sweep).
create function public.expire_booker_pro_subscriptions()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  sub record;
  chosen_artist uuid;
begin
  for sub in
    select * from public.subscriptions
    where role = 'booker'
      and booker_plan = 'pro'
      and pro_period_ends_at is not null
      and pro_period_ends_at < current_date
  loop
    chosen_artist := null;

    select b.artist_profile_id into chosen_artist
    from public.bookings b
    where b.booker_profile_id = sub.profile_id
      and b.status in ('proposta_enviada', 'aceita', 'aguardando_pagamento')
    order by b.updated_at desc
    limit 1;

    if chosen_artist is null then
      select b.artist_profile_id into chosen_artist
      from public.bookings b
      where b.booker_profile_id = sub.profile_id
      order by b.updated_at desc
      limit 1;
    end if;

    if chosen_artist is null then
      select r.artist_profile_id into chosen_artist
      from public.representations r
      where r.booker_profile_id = sub.profile_id
      order by r.created_at desc
      limit 1;
    end if;

    update public.subscriptions
    set
      booker_plan = 'basic',
      active_artist_profile_id = chosen_artist,
      active_artist_pending_choice = (chosen_artist is not null),
      pro_period_ends_at = null,
      status = 'active',
      canceled_at = coalesce(canceled_at, now()),
      updated_at = now()
    where id = sub.id;
  end loop;
end;
$$;
