-- Multi-role: base segura (07/09/2026) — item 8/10 do Bloco A. Escopo
-- deliberadamente limitado ao que é tecnicamente decidível agora:
-- schema + RPCs que permitem uma identidade (1 auth.users = 1
-- public.profiles, nunca duplicado) acumular mais de um papel
-- (artista e/ou booker). NÃO inclui UI pra pedir um segundo papel —
-- expor esse botão sem antes decidir se uma conta multi-role paga uma
-- ou duas subscriptions (a ÚNICA decisão comercial que o founder
-- pediu pra deixar explicitamente pendente) ou prometeria um preço
-- ainda não decidido, ou nos forçaria a escolher um preço por conta
-- própria — por isso fica em DECISION REQUIRED FROM FOUNDER, não em
-- OPEN/TODO. Este arquivo entrega o que NÃO depende dessa decisão:
-- o profile continuar existindo em toda parte do produto sem
-- precisar saber que multi-role existe.
--
-- Modelo escolhido: continua existindo 1 linha em `profiles` por
-- pessoa (nunca 2 auth.users/profiles pra representar os 2 papéis —
-- isso quebraria toda a base de RLS/FKs que hoje assume profiles.id
-- como identidade única). `profiles.role` passa a significar "papel
-- ATIVO agora" (contexto ativo — o resto do produto inteiro já lê
-- esse campo em ~30 lugares pra decidir o que mostrar, então trocar o
-- contexto ativo já funciona em todo canto sem reescrever nada). A
-- nova tabela `profile_roles` é o conjunto de papéis que a identidade
-- JÁ TEM (pode crescer, nunca diminui aqui — remover um papel não foi
-- pedido). `switch_active_role` só deixa trocar pra um papel que já
-- está em profile_roles (nunca promove um papel novo escondido).
-- `add_secondary_role` é o único jeito de GANHAR um papel novo — cria
-- a extensão (artist_profiles/booker_profiles) vazia, do jeito que
-- handle_new_user já faz no cadastro, e deliberadamente NÃO toca em
-- `subscriptions` (nenhuma linha nova, nenhuma cobrança implícita) —
-- é exatamente a parte que fica pendente da decisão comercial.
--
-- Trava anti-autocobertura por identidade: já existe e continua
-- valendo sem nenhuma mudança. `representations_different_parties`
-- CHECK (artist_profile_id <> booker_profile_id) e o CHECK espelhado
-- em representation_requests garantem que a MESMA identidade nunca
-- pode se representar (o papel artista e o papel booker da mesma
-- pessoa nunca preenchem os dois lados dessas colunas ao mesmo
-- tempo, porque as duas colunas guardam o mesmo profiles.id — não
-- "uma linha por papel"). Multi-role não abre brecha nova aqui: só
-- torna esse caso alcançável pela primeira vez, e o CHECK já cobria.

create table public.profile_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

comment on table public.profile_roles is 'Papéis que uma identidade (profiles.id) já adquiriu. profiles.role continua sendo o papel ATIVO agora (contexto ativo, lido em todo o resto do produto); profile_roles é o conjunto completo. 1:N — nunca duplica profiles em papéis diferentes.';

alter table public.profile_roles enable row level security;

create policy "profile_roles: select own"
  on public.profile_roles for select
  using (profile_id = auth.uid());

-- Só leitura — toda escrita acontece via add_secondary_role/
-- switch_active_role (security definer, sempre pelo próprio auth.uid()),
-- nunca direto da tabela.
grant select on public.profile_roles to authenticated;

-- Backfill: toda identidade existente já tem exatamente o papel que
-- profiles.role já diz que ela tem.
insert into public.profile_roles (profile_id, role)
select id, role from public.profiles
on conflict do nothing;

-- handle_new_user(): mesmo corpo de sempre (ver migration 0069), só
-- com UMA linha nova logo depois do insert em profiles — todo cadastro
-- novo já nasce com seu papel inicial espelhado em profile_roles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role public.user_role;
  meta jsonb;
  invite jsonb;
  matched_profile_id uuid;
  referrer_id uuid;
  booker_invite jsonb;
  voucher_code text;
  matched_voucher record;
  chosen_plan text;
  invite_token text;
begin
  meta := new.raw_user_meta_data;
  new_role := coalesce(meta ->> 'role', 'artista')::public.user_role;

  insert into public.profiles (id, role, full_name, phone, city, state)
  values (
    new.id,
    new_role,
    coalesce(meta ->> 'full_name', ''),
    nullif(trim(meta ->> 'whatsapp'), ''),
    nullif(trim(split_part(coalesce(meta ->> 'local', meta ->> 'cidades', ''), ',', 1)), ''),
    nullif(trim(split_part(coalesce(meta ->> 'local', meta ->> 'cidades', ''), ',', 2)), '')
  );

  insert into public.profile_roles (profile_id, role) values (new.id, new_role);

  if coalesce(meta ->> 'referralCode', '') <> '' then
    select id into referrer_id
    from public.profiles
    where referral_code = meta ->> 'referralCode';

    if referrer_id is not null and referrer_id <> new.id then
      insert into public.referrals (referrer_profile_id, referred_profile_id, code)
      values (referrer_id, new.id, meta ->> 'referralCode');
    end if;
  end if;

  -- Vínculo por link de convite — bidirecional, papel-consciente,
  -- restaurado/espelhado aqui (ver comentário acima da função).
  invite_token := nullif(trim(meta ->> 'pendingInviteToken'), '');
  if invite_token is not null then
    update public.invites
    set invitee_profile_id = new.id
    where token = invite_token::uuid
      and status = 'pendente'
      and expires_at > now()
      and invitee_profile_id is null
      and invitee_role = new_role;
  end if;

  if new_role = 'artista' then
    insert into public.artist_profiles (
      profile_id, stage_name, category, bio,
      intencao, pontual_detalhe, funcao, local, mercados, tem_booker,
      work_types, client_types, regions, languages, career_stage,
      help_areas, fee_range
    ) values (
      new.id,
      coalesce(meta ->> 'stageName', meta ->> 'full_name'),
      meta ->> 'categoria',
      meta ->> 'bio',
      meta ->> 'intencao',
      meta ->> 'pontualDetalhe',
      meta ->> 'categoria',
      meta ->> 'local',
      meta ->> 'mercados',
      meta ->> 'temBooker',
      public.jsonb_text_array(meta ->> 'workTypes'),
      '{}'::text[],
      public.jsonb_text_array(meta ->> 'regions'),
      '{}'::text[],
      meta ->> 'careerStage',
      public.jsonb_text_array(meta ->> 'helpAreas'),
      meta ->> 'feeRange'
    );

    if coalesce(meta ->> 'pendingBookerInvite', '') <> '' then
      booker_invite := (meta ->> 'pendingBookerInvite')::jsonb;
      if coalesce(booker_invite ->> 'name', '') <> '' then
        matched_profile_id := null;
        if (booker_invite ->> 'contact') ilike '%@%' then
          select p.id into matched_profile_id
          from auth.users u
          join public.profiles p on p.id = u.id
          where lower(u.email) = lower(booker_invite ->> 'contact')
            and p.role = 'booker'
          limit 1;
        end if;

        insert into public.invites (
          inviter_profile_id, invitee_name, invitee_contact, invitee_profile_id, invitee_role
        ) values (
          new.id,
          booker_invite ->> 'name',
          nullif(booker_invite ->> 'contact', ''),
          matched_profile_id,
          'booker'
        );
      end if;
    end if;

    chosen_plan := meta ->> 'artistPlan';
    if chosen_plan not in ('doopla', 'pro') then
      chosen_plan := 'doopla';
    end if;

    voucher_code := nullif(trim(meta ->> 'founderVoucherCode'), '');
    matched_voucher := null;
    if voucher_code is not null then
      select * into matched_voucher from public.founder_vouchers
        where code = voucher_code and redeemed_by_profile_id is null
        for update;
    end if;

    if matched_voucher is not null then
      update public.founder_vouchers
        set redeemed_by_profile_id = new.id, redeemed_at = now()
        where id = matched_voucher.id;

      insert into public.subscriptions (
        profile_id, role, status, price_rule, locked_price_cents, founder_voucher_id, trial_ends_at, artist_plan
      ) values (
        new.id, 'artista', 'trialing', 'founder_locked', matched_voucher.locked_price_cents,
        matched_voucher.id, (now() + interval '7 days')::date, chosen_plan
      );
    else
      insert into public.subscriptions (profile_id, role, status, price_rule, trial_ends_at, artist_plan)
      values (new.id, 'artista', 'trialing', 'standard_launch', (now() + interval '7 days')::date, chosen_plan);
    end if;
  elsif new_role = 'booker' then
    insert into public.booker_profiles (
      profile_id, modo_trabalho, perfil, foco, mercados, quem, cidades, ja_representa, roster,
      artist_categories, client_types, regions, languages, specialty_areas, capacity, fee_range,
      commission_range
    ) values (
      new.id,
      meta ->> 'modoTrabalho',
      meta ->> 'perfil',
      meta ->> 'foco',
      meta ->> 'mercados',
      meta ->> 'quem',
      meta ->> 'cidades',
      meta ->> 'jaRepresenta',
      meta ->> 'roster',
      public.jsonb_text_array(meta ->> 'artistCategories'),
      public.jsonb_text_array(meta ->> 'clientTypes'),
      public.jsonb_text_array(meta ->> 'regions'),
      public.jsonb_text_array(meta ->> 'languages'),
      public.jsonb_text_array(meta ->> 'specialtyAreas'),
      meta ->> 'capacity',
      public.jsonb_text_array(meta ->> 'feeRange'),
      meta ->> 'commissionRange'
    );

    if coalesce(meta ->> 'pendingInvites', '') <> '' then
      for invite in select * from jsonb_array_elements((meta ->> 'pendingInvites')::jsonb)
      loop
        matched_profile_id := null;

        if (invite ->> 'contact') ilike '%@%' then
          select p.id into matched_profile_id
          from auth.users u
          join public.profiles p on p.id = u.id
          where lower(u.email) = lower(invite ->> 'contact')
            and p.role = 'artista'
          limit 1;
        end if;

        insert into public.invites (
          inviter_profile_id, invitee_name, invitee_contact, invitee_profile_id, invitee_role
        ) values (
          new.id,
          invite ->> 'name',
          nullif(invite ->> 'contact', ''),
          matched_profile_id,
          'artista'
        );
      end loop;
    end if;

    insert into public.subscriptions (profile_id, role, status)
    values (new.id, 'booker', 'active');
  else
    insert into public.agency_profiles (profile_id, agency_name, roster, agentes, mercado)
    values (
      new.id,
      coalesce(meta ->> 'full_name', ''),
      meta ->> 'roster',
      meta ->> 'agentes',
      meta ->> 'mercado'
    );
  end if;

  return new;
end;
$$;

-- Ganhar um segundo papel (artista <-> booker; nunca 'agencia', tipo
-- de conta descontinuado pro cadastro). Cria só a extensão vazia
-- (mesmo shape que handle_new_user cria no cadastro normal, sem
-- nenhum dos campos opcionais de onboarding — quem ganha o papel
-- preenche depois, do jeito que qualquer profile preenche seu
-- perfil). Deliberadamente NÃO mexe em subscriptions nem em
-- profiles.role (ganhar um papel não troca o contexto ativo sozinho —
-- ver switch_active_role). NÃO decide se isso é grátis ou gera
-- cobrança: essa é a decisão comercial pendente, e esta função só
-- entrega a estrutura, nunca uma resposta pra ela.
create or replace function public.add_secondary_role(p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_role not in ('artista', 'booker') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profile_roles where profile_id = v_caller and role = p_role) then
    raise exception 'role_already_held' using errcode = 'P0001';
  end if;

  insert into public.profile_roles (profile_id, role) values (v_caller, p_role);

  if p_role = 'artista' then
    insert into public.artist_profiles (profile_id) values (v_caller)
    on conflict (profile_id) do nothing;
  else
    insert into public.booker_profiles (profile_id) values (v_caller)
    on conflict (profile_id) do nothing;
  end if;
end;
$$;

comment on function public.add_secondary_role(public.user_role) is 'Multi-role — adiciona um segundo papel à identidade chamando (profile_roles + extensão vazia). Nunca mexe em subscriptions/billing nem no papel ativo (profiles.role) — decisão comercial de cobrança fica pendente do founder.';

grant execute on function public.add_secondary_role(public.user_role) to authenticated;

-- Trocar o contexto ativo (profiles.role) entre papéis que a
-- identidade JÁ TEM — nunca promove um papel novo escondido (só
-- add_secondary_role cria papel novo). O resto do produto inteiro já
-- lê profiles.role pra decidir o que mostrar, então trocar aqui já
-- funciona em toda parte sem precisar reescrever nada.
create or replace function public.switch_active_role(p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profile_roles where profile_id = v_caller and role = p_role) then
    raise exception 'role_not_held' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = v_caller;
end;
$$;

comment on function public.switch_active_role(public.user_role) is 'Multi-role — troca profiles.role (contexto ativo) pra um papel que a identidade já tem em profile_roles. Nunca cria papel novo (ver add_secondary_role).';

grant execute on function public.switch_active_role(public.user_role) to authenticated;
