-- Doopla — Autoridade de escrita de `subscriptions` (07/09/2026).
--
-- Achado da auditoria: "subscriptions: update own" (migration 0031)
-- nunca teve WITH CHECK. Pra UPDATE, a ausência de WITH CHECK faz o
-- Postgres reusar a USING clause como check da linha nova — ou seja, o
-- único requisito era profile_id continuar igual a auth.uid(). Nenhuma
-- outra coluna era restringida: qualquer authenticated podia, na
-- própria linha, setar artist_plan='pro', status='active',
-- trial_ends_at no futuro, booker_plan='pro', role, canceled_at,
-- pro_period_ends_at, price_rule, locked_price_cents,
-- founder_voucher_id — self-grant completo de entitlement, comprovado
-- com teste adversarial real (UPDATE direto passou, e a trigger de
-- limite de bookings — que lê a tabela, não o client — tratou o
-- estado forjado como Pro de verdade).
--
-- Regra de autoridade daqui em diante: CLIENT NÃO ALTERA DIRETAMENTE
-- ESTADO COMERCIAL/ENTITLEMENT DA SUBSCRIPTION. Isso inclui
-- artist_plan (mesmo sozinho não concedendo Pro hoje — é estado
-- comercial, não um campo operacional). Os dois campos genuinamente
-- operacionais (active_artist_profile_id/active_artist_pending_choice
-- — escolha de qual artista fica ativo no Básico do booker, nunca
-- amplia capacidade) continuam graváveis direto, por coluna, com
-- ownership.
--
-- Toda mutação de estado comercial passa a exigir uma autoridade
-- SECURITY DEFINER dedicada (mesmo padrão já usado por
-- set_payment_details, migration 0046): select_artist_plan (onboarding
-- escolhe Doopla/Doopla Pro — só durante o trial, nunca aceita
-- status/trial/preço do client), confirm_booker_pro_upgrade e
-- cancel_booker_pro (substituem os UPDATEs crus de upgradeToProAction/
-- cancelProAction, que hoje rodavam com o client RLS-scoped do próprio
-- usuário — ou seja, não eram proteção nenhuma além do que qualquer
-- client já podia fazer direto).
--
-- artist_has_doopla_pro() (0074) não muda — a autoridade de
-- ENTITLEMENT continua sendo essa function. Este arquivo é sobre quem
-- pode ESCREVER os dados que alimentam ela. Sem Stripe ainda: as duas
-- RPCs de booker continuam sendo só estado gravado, mesmo estágio do
-- resto do produto — mas agora atrás de uma autoridade real, pronta
-- pra um futuro webhook (via service_role, que ignora RLS/grants, nunca
-- pelo caminho do client) assumir sem reabrir nada.

-- =====================================================================
-- 1) subscriptions — revoga INSERT/UPDATE/DELETE amplo de
-- anon/authenticated. INSERT nunca teve uso legítimo do client (só
-- handle_new_user, SECURITY DEFINER, insere via gatilho — não precisa
-- de grant pra isso, roda com o privilégio do dono da function).
-- =====================================================================
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- Únicas colunas que continuam graváveis direto pelo dono da linha —
-- operacionais, nunca concedem entitlement/capacidade extra (ver
-- isArtistBlockedForBooker em src/lib/subscription.ts: só restringe
-- QUAL artista fica desbloqueado no Básico, nunca amplia quantos).
-- updated_at entra na lista só por ser bookkeeping puro (nunca lido por
-- nenhuma decisão de autorização/entitlement — grep confirma isso),
-- necessário porque chooseActiveArtistAction sempre grava os três
-- juntos.
grant update (active_artist_profile_id, active_artist_pending_choice, updated_at)
  on public.subscriptions to authenticated;

drop policy if exists "subscriptions: insert own" on public.subscriptions;
drop policy if exists "subscriptions: update own" on public.subscriptions;

-- "subscriptions: select own" (0031) não muda — select continua
-- liberado pro dono, sem alteração de comportamento.

-- WITH CHECK explícito (defesa em profundidade — o grant por coluna já
-- torna profile_id/demais campos comerciais impossíveis de aparecer no
-- SET, mas a policy nunca deve depender só disso).
create policy "subscriptions: update own operational fields" on public.subscriptions
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

comment on table public.subscriptions is 'Estado real da assinatura por perfil. Client só grava active_artist_profile_id/active_artist_pending_choice direto (07/09/2026) — todo o resto (status, artist_plan, trial_ends_at, booker_plan, role, canceled_at, pro_period_ends_at, price_rule, locked_price_cents, founder_voucher_id) é escrito exclusivamente por handle_new_user (insert inicial) ou pelas RPCs SECURITY DEFINER select_artist_plan/confirm_booker_pro_upgrade/cancel_booker_pro. Sem processador de pagamento real ainda — RPCs só gravam estado, mesmo estágio do resto do produto.';

-- =====================================================================
-- 2) founder_vouchers — "claim if unredeemed" nunca foi usada por
-- nenhum caminho de aplicação real: a redenção do voucher acontece
-- inteira dentro de handle_new_user (SECURITY DEFINER, dispara no
-- signup via auth.users), que não depende de grant/policy pra
-- authenticated. Confirmado por busca no repo inteiro: nenhum arquivo
-- TS chama .from('founder_vouchers').update(...). A policy era
-- superfície de ataque pura — permitia, na mesma chamada que reivindica
-- um voucher ainda livre, adulterar locked_price_cents/code/note (só
-- redeemed_by_profile_id tinha WITH CHECK). Sem fluxo legítimo
-- dependendo dela, remove — não substitui por nada, pois nada
-- precisava dela.
-- =====================================================================
drop policy if exists "founder_vouchers: claim if unredeemed" on public.founder_vouchers;
revoke update on public.founder_vouchers from authenticated;

-- "founder_vouchers: select authenticated" não muda.

-- =====================================================================
-- 3) select_artist_plan — única autoridade pra escolha de plano do
-- onboarding (savePlanAction, /cadastro/plano). Nunca aceita status/
-- trial/preço do client — só o enum do plano, com o resto validado no
-- servidor: auth.uid() != null, dono é artista, e só permite a escolha
-- ENQUANTO status='trialing' (a decisão de plano é parte do onboarding/
-- trial; depois disso, mudar de plano é operação comercial de verdade,
-- que ainda não existe — bloqueado aqui até existir, nunca liberado por
-- omissão). Escolher 'pro' aqui não é um "bypass" do entitlement: o
-- artista comprovadamente continua em trial (status inalterado por
-- esta function), então artist_has_doopla_pro() decide Pro/Básico do
-- jeito de sempre — só passa a refletir a escolha real.
-- =====================================================================
create function public.select_artist_plan(p_plan text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_plan not in ('doopla', 'pro') then
    raise exception 'invalid_plan' using errcode = 'P0001';
  end if;

  select role, status into v_sub
  from public.subscriptions
  where profile_id = v_uid
  for update;

  if v_sub is null or v_sub.role <> 'artista' then
    raise exception 'not_an_artist_subscription' using errcode = 'P0001';
  end if;

  if v_sub.status <> 'trialing' then
    raise exception 'plan_selection_not_allowed_in_current_state' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set artist_plan = p_plan, updated_at = now()
  where profile_id = v_uid;
end;
$$;

comment on function public.select_artist_plan(text) is 'Único caminho de escrita de subscriptions.artist_plan pelo client (07/09/2026) — chamada por savePlanAction (/cadastro/plano). Nunca aceita status/trial/preço; só troca artist_plan, e só enquanto a assinatura ainda está trialing. Escolher pro aqui não concede Pro por si só — artist_has_doopla_pro() (0074) continua sendo a autoridade real, decidindo pela combinação de status/trial_ends_at.';

revoke all on function public.select_artist_plan(text) from public;
grant execute on function public.select_artist_plan(text) to authenticated;

-- =====================================================================
-- 4) confirm_booker_pro_upgrade / cancel_booker_pro — substituem os
-- UPDATEs crus de upgradeToProAction/cancelProAction. Antes, essas
-- Server Actions rodavam com o client RLS-scoped do próprio usuário —
-- ou seja, não eram proteção nenhuma além da RLS quebrada (qualquer
-- client conseguia fazer exatamente a mesma escrita direto). Agora
-- ambas são SECURITY DEFINER: validam auth.uid(), ownership e role
-- (só booker), e gravam valores fixos no servidor — nunca aceitam
-- status/pro_period_ends_at/booker_plan vindos do client. Continuam
-- sem processador de pagamento real (mesmo estágio de sempre); só
-- passam a ser a única porta de escrita.
-- =====================================================================
create function public.confirm_booker_pro_upgrade()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select role into v_role from public.subscriptions where profile_id = v_uid;
  if v_role is distinct from 'booker' then
    raise exception 'only_bookers_can_upgrade' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set
    booker_plan = 'pro',
    status = 'active',
    pro_period_ends_at = null,
    active_artist_profile_id = null,
    active_artist_pending_choice = false,
    canceled_at = null,
    updated_at = now()
  where profile_id = v_uid;
end;
$$;

comment on function public.confirm_booker_pro_upgrade() is 'Único caminho de escrita do upgrade Booker Pro (07/09/2026) — chamada por upgradeToProAction. Valores fixos, nunca vindos do client. Sem processador de pagamento real ainda (mesmo estágio do resto do produto) — pronta pra um futuro webhook Stripe assumir via service_role sem reabrir escrita direta pro client.';

revoke all on function public.confirm_booker_pro_upgrade() from public;
grant execute on function public.confirm_booker_pro_upgrade() to authenticated;

create function public.cancel_booker_pro()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select role, booker_plan into v_sub from public.subscriptions where profile_id = v_uid;
  if v_sub is null or v_sub.role <> 'booker' or v_sub.booker_plan <> 'pro' then
    raise exception 'no_active_pro_subscription_to_cancel' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set
    canceled_at = now(),
    pro_period_ends_at = (current_date + interval '30 days')::date,
    updated_at = now()
  where profile_id = v_uid;
end;
$$;

comment on function public.cancel_booker_pro() is 'Único caminho de escrita do cancelamento Booker Pro (07/09/2026) — chamada por cancelProAction. Período de 30 dias calculado no servidor, nunca vindo do client.';

revoke all on function public.cancel_booker_pro() from public;
grant execute on function public.cancel_booker_pro() to authenticated;

-- =====================================================================
-- 5) expire_booker_pro_subscriptions — antes varria TODOS os bookers
-- Pro vencidos, com EXECUTE aberto pra PUBLIC (nunca restringido em
-- nenhuma migration): qualquer authenticated conseguia disparar um
-- UPDATE em massa em linhas de OUTROS usuários. Só fazia downgrade
-- (nunca upgrade), então nunca foi uma escalação de privilégio — mas
-- violava least-privilege (efeito global disparável por qualquer
-- authenticated). Corrigido escopando ao próprio auth.uid(): preserva
-- o comportamento legítimo de sempre (sweep sob demanda antes de ler o
-- próprio plano, chamado em getSubscription) e elimina o efeito global.
-- =====================================================================
create or replace function public.expire_booker_pro_subscriptions()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  sub record;
  chosen_artist uuid;
begin
  if v_uid is null then
    return;
  end if;

  for sub in
    select * from public.subscriptions
    where profile_id = v_uid
      and role = 'booker'
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

comment on function public.expire_booker_pro_subscriptions() is 'Sweep sob demanda (07/09/2026: escopado a auth.uid(), nunca mais global) — chamado antes de ler o plano do próprio booker (getSubscription). Só efetiva downgrade na própria linha de quem chama; nunca toca subscription de outro usuário.';

revoke all on function public.expire_booker_pro_subscriptions() from public;
grant execute on function public.expire_booker_pro_subscriptions() to authenticated;
