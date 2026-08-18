-- Doopla — Assinatura do Artista: preço público real + voucher Founder.
--
-- Especificação final de preços: "primeiros 50 artistas = R$19,90/mês
-- pra sempre" está descartada. Oferta pública (Home, cadastro, qualquer
-- lugar visível): 7 dias grátis -> R$19,90 no 1º mês -> R$39,90/mês.
-- Nunca chamada de "Preço Fundador" em lugar nenhum público.
--
-- Existe uma condição especial (voucher Founder) concedida manualmente
-- artista por artista pela fundadora, nunca anunciada publicamente:
-- trava R$19,90/mês recorrente enquanto a assinatura ficar ativa.
-- Sem painel de admin por enquanto — o voucher é inserido direto no
-- banco (`insert into founder_vouchers (code, note) values (...)`) e
-- passado manualmente pra pessoa.
--
-- Sem processador de pagamento integrado ainda (nem Stripe, nem
-- nenhum) — "confirmar assinatura" aqui é só estado real gravado no
-- banco, sem cobrança de cartão de verdade. Mesmo estágio de outras
-- partes do produto (ex: saque em dinheiro também é só estado).
--
-- Regra técnica central: a cobrança recorrente sempre consulta a
-- condição JÁ GRAVADA na assinatura daquele usuário (price_rule,
-- locked_price_cents) — nunca um preço global do plano recalculado.
-- Mudar o preço público no futuro nunca altera retroativamente uma
-- assinatura Founder já travada.

create table public.founder_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  locked_price_cents integer not null default 1990,
  note text,
  redeemed_by_profile_id uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.founder_vouchers is 'Vouchers Founder gerados manualmente pela fundadora (insert direto no banco) — nunca anunciados publicamente. Redimido uma vez, no cadastro do artista, trava locked_price_cents recorrente na assinatura.';

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  role public.user_role not null,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'canceled')),
  -- Artista: regra de preço travada nessa assinatura específica.
  price_rule text check (price_rule in ('standard_launch', 'founder_locked')),
  locked_price_cents integer,
  founder_voucher_id uuid references public.founder_vouchers (id) on delete set null,
  trial_ends_at date,
  started_at timestamptz not null default now(),
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is 'Estado real da assinatura por perfil. Artista usa price_rule/locked_price_cents/founder_voucher_id (nunca recalcula preço a partir de um valor global). Booker usa booker_plan (coluna adicionada em migration futura). Sem processador de pagamento real ainda — "confirmar assinatura" só grava esse estado.';

alter table public.founder_vouchers enable row level security;
alter table public.subscriptions enable row level security;

create policy "founder_vouchers: select authenticated" on public.founder_vouchers
  for select using (auth.uid() is not null);
-- Compare-and-swap: só reivindica se ainda ninguém redimiu.
create policy "founder_vouchers: claim if unredeemed" on public.founder_vouchers
  for update using (redeemed_by_profile_id is null)
  with check (redeemed_by_profile_id = auth.uid());

create policy "subscriptions: select own" on public.subscriptions
  for select using (auth.uid() = profile_id);
create policy "subscriptions: insert own" on public.subscriptions
  for insert with check (auth.uid() = profile_id);
create policy "subscriptions: update own" on public.subscriptions
  for update using (auth.uid() = profile_id);

-- Atualiza a trigger de criação de perfil pra também criar a
-- assinatura: artista sempre entra em trial (7 dias), com price_rule
-- 'standard_launch' por padrão, ou 'founder_locked' se um código de
-- voucher válido e ainda não redimido vier em founderVoucherCode.
-- Booker entra 'active' sem price_rule (booker_plan chega na próxima
-- migration).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
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
begin
  meta := new.raw_user_meta_data;
  new_role := coalesce(meta ->> 'role', 'artista')::public.user_role;

  insert into public.profiles (id, role, full_name, city, state)
  values (
    new.id,
    new_role,
    coalesce(meta ->> 'full_name', ''),
    nullif(trim(split_part(coalesce(meta ->> 'local', meta ->> 'cidades', ''), ',', 1)), ''),
    nullif(trim(split_part(coalesce(meta ->> 'local', meta ->> 'cidades', ''), ',', 2)), '')
  );

  if coalesce(meta ->> 'referralCode', '') <> '' then
    select id into referrer_id
    from public.profiles
    where referral_code = meta ->> 'referralCode';

    if referrer_id is not null and referrer_id <> new.id then
      insert into public.referrals (referrer_profile_id, referred_profile_id, code)
      values (referrer_id, new.id, meta ->> 'referralCode');
    end if;
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

    -- Artista convidando o próprio booker durante o cadastro (opcional —
    -- "Traga sua dupla pra doopla"). Direção inversa do fluxo original:
    -- aqui o artista é quem convida, o booker é quem confirma depois.
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
          inviter_profile_id, invitee_name, invitee_contact, invitee_profile_id
        ) values (
          new.id,
          booker_invite ->> 'name',
          nullif(booker_invite ->> 'contact', ''),
          matched_profile_id
        );
      end if;
    end if;

    -- Assinatura do artista: sempre em trial, preço padrão ou travado
    -- via voucher Founder (validado e reivindicado aqui, na própria
    -- transação de cadastro).
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
        profile_id, role, status, price_rule, locked_price_cents, founder_voucher_id, trial_ends_at
      ) values (
        new.id, 'artista', 'trialing', 'founder_locked', matched_voucher.locked_price_cents,
        matched_voucher.id, (now() + interval '7 days')::date
      );
    else
      insert into public.subscriptions (profile_id, role, status, price_rule, trial_ends_at)
      values (new.id, 'artista', 'trialing', 'standard_launch', (now() + interval '7 days')::date);
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
          inviter_profile_id, invitee_name, invitee_contact, invitee_profile_id
        ) values (
          new.id,
          invite ->> 'name',
          nullif(invite ->> 'contact', ''),
          matched_profile_id
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
