-- Doopla — Artista já agenciado: convite com link seguro (token) +
-- onboarding reduzido.
--
-- Gap real que já existia desde a migration 0005 (comentário original:
-- "envio de fato pra quem ainda não tem conta fica em aberto de
-- propósito"): um convite pra alguém sem conta só virava vínculo se o
-- e-mail informado batesse EXATAMENTE com o e-mail usado no cadastro,
-- checado uma única vez, na hora de criar o convite. Se a pessoa se
-- cadastrasse depois (o caso comum), o convite nunca era resolvido.
--
-- Agora: `invites.token` (já existe desde 0005) vira link real
-- (`/convite/<token>`). Quem chega por esse link e cria conta passa o
-- token no cadastro — a trigger liga `invitee_profile_id` direto pelo
-- token, sem depender de bater contato. Não muda nada do fluxo
-- existente pra quem não usa link (contact match continua funcionando
-- do jeito que já funcionava).

-- Consulta pública e mínima pro token: só o necessário pra a landing
-- page "Você foi convidado por X" — nunca expõe o convite inteiro, e
-- nunca revela nada se o token não existe, já expirou (não há campo de
-- expiração, mas já foi confirmado) ou não é mais 'pendente'.
create or replace function public.get_invite_by_token(p_token uuid)
returns table (
  inviter_name text,
  inviter_role public.user_role,
  invitee_name text
)
language sql
security definer
set search_path = public
as $$
  select p.full_name, p.role, i.invitee_name
  from public.invites i
  join public.profiles p on p.id = i.inviter_profile_id
  where i.token = p_token and i.status = 'pendente'
  limit 1;
$$;

comment on function public.get_invite_by_token(uuid) is 'Lookup público (anon + authenticated) pra landing page /convite/[token]. Só retorna convite pendente — nunca vaza dado de convite já confirmado ou inexistente.';

grant execute on function public.get_invite_by_token(uuid) to anon, authenticated;

-- Reescreve handle_new_user só pra adicionar o passo de vínculo por
-- token (resto idêntico à versão anterior, migration 0031).
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
  invite_token text;
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

    -- Chegou por link de convite (agência/booker convidando um artista
    -- que ainda não tinha conta) — liga direto pelo token, sem
    -- depender de contato bater. Só resolve convite ainda pendente e
    -- ainda não vinculado a ninguém (nunca reusa um token já gasto).
    invite_token := nullif(trim(meta ->> 'pendingInviteToken'), '');
    if invite_token is not null then
      update public.invites
      set invitee_profile_id = new.id
      where token = invite_token::uuid
        and status = 'pendente'
        and invitee_profile_id is null;
    end if;

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
