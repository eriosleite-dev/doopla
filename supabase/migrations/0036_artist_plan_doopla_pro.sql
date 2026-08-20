-- Doopla — Plano do artista (Doopla / Doopla Pro), separado do preço.
--
-- Pivô AI-first desta sessão: os planos públicos do artista deixam de
-- ser um único tier ("R$19,90 no 1º mês -> R$39,90/mês", migration
-- 0031) e passam a ser dois — Doopla (R$29,90/mês) e Doopla Pro
-- (R$59,90/mês) — escolhidos no próprio cadastro. `booker_plan`
-- (migration 0032) é uma coluna à parte, exclusiva do booker (limite
-- de 1 artista ativo no Básico) — não reaproveitada aqui de propósito,
-- pra não misturar as duas regras de negócio.
--
-- Preço em si continua vindo de price_rule/locked_price_cents (sem
-- mudança) — artist_plan só marca QUAL dos dois planos a pessoa
-- escolheu, pra diferenciar limite de bookings e recursos entre eles.
-- Sem processador de pagamento real ainda (mesmo estágio do resto do
-- produto): trial de 7 dias sem cartão continua sendo só estado
-- gravado, via handle_new_user (migration 0031), sem cobrança de
-- verdade.

alter table public.subscriptions
  add column artist_plan text check (artist_plan in ('doopla', 'pro'));

comment on column public.subscriptions.artist_plan is 'Plano escolhido pelo artista no cadastro: doopla ou pro. Null para assinaturas de booker (usa booker_plan) e para assinaturas de artista criadas antes desta coluna existir.';

-- Assinaturas de artista já existentes (antes desta migration) ficam
-- em 'doopla' por padrão — é o plano de entrada, sem perder acesso a
-- nada que já usavam.
update public.subscriptions set artist_plan = 'doopla' where role = 'artista' and artist_plan is null;

-- Atualiza a trigger de criação de perfil pra gravar o plano escolhido
-- no cadastro (meta ->> 'artistPlan'), com 'doopla' como padrão se o
-- valor vier ausente ou inválido.
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
  chosen_plan text;
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
