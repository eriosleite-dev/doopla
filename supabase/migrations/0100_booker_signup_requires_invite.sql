-- Doopla — trava de convite pro cadastro de Booker.
--
-- Achado de auditoria (06/10/2026): /cadastro?tipo=booker sem
-- ?invite= cai no wizard antigo com showRolePicker=true — qualquer
-- visitante cria uma conta role='booker' completa sem nenhum convite,
-- porque handle_new_user() só usava pendingInviteToken pra VINCULAR o
-- convite quando presente, nunca pra EXIGIR um. Decisão da fundadora
-- (06/10/2026): cadastro de Booker passa a exigir convite pendente e
-- válido, sem refatorar a arquitetura de roles nem tocar no shell do
-- Booker.
--
-- Escopo desta migration, por decisão explícita da fundadora:
--
-- 1) add_secondary_role('booker') é outro caminho pra virar Booker sem
--    convite (RPC dormente, grant a `authenticated`, zero call sites
--    no produto hoje — confirmado por busca no repo inteiro). Decisão:
--    não criar fluxo de convite pra ela agora; revoga EXECUTE de
--    authenticated por toda a fase de beta. Reversível por um GRANT
--    simples quando o Booker ganhar um fluxo de "virar Booker"
--    legítimo fora do cadastro novo. Nunca mexe em profile_roles,
--    add_secondary_role em si ou switch_active_role (esta última
--    nunca cria papel novo, só troca entre papéis já adquiridos — não
--    é vetor).
--
-- 2) O vínculo do token agora precisa ser atômico e resistente a
--    corrida: pra Booker, o UPDATE que reclama o convite roda ANTES
--    de qualquer outra coisa decidir se a conta se completa, e seu
--    resultado (RETURNING) decide se a função segue ou aborta com
--    RAISE EXCEPTION. Não há SELECT de validação seguido de UPDATE
--    separado — é um único UPDATE ... WHERE ... RETURNING, que já é
--    atômico por natureza do Postgres: a trava de linha do UPDATE
--    serializa duas tentativas simultâneas pro MESMO token (a segunda
--    espera a primeira commitar, reavalia o WHERE contra o dado já
--    committed — invitee_profile_id não é mais null — e não encontra
--    linha, RETURNING vem vazio, exception). RAISE EXCEPTION dentro de
--    uma function SECURITY DEFINER chamada por um trigger AFTER INSERT
--    aborta a transação inteira do INSERT em auth.users — nenhuma
--    linha fica gravada em profiles/profile_roles em caso de falha,
--    mesmo elas tendo sido inseridas ANTES deste bloco (ordem
--    necessária: a FK de invites.invitee_profile_id só aceita um id
--    que já exista em profiles).
--
--    Pra artista, o comportamento permanece EXATAMENTE como já era:
--    vínculo best-effort, nunca bloqueia a criação da conta.
--
-- 3) invites.invitee_contact é texto livre preenchido por quem convida
--    (nunca validado/normalizado, pode ser e-mail ou telefone) — não
--    existe uma coluna dedicada que amarre o convite à identidade real
--    de quem aceita. Checado: a única correspondência por e-mail no
--    código hoje (handle_new_user, branches de pendingBookerInvite/
--    pendingInvites) é heurística (ilike '%@%') e serve só pra
--    PRÉ-vincular um convite a uma conta JÁ existente — nunca foi
--    desenhada como verificação de identidade do lado de quem ACEITA.
--    Decisão: não construir correspondência nova agora (exigiria
--    normalizar telefone/e-mail e aceitar risco de falso-negativo
--    quebrando convite legítimo) — registrado aqui como limitação
--    conhecida, não ampliado o escopo. Consequência concreta: quem já
--    tem qualquer conta pode se auto-inserir um convite (RLS
--    "invites: insert own" permite qualquer authenticated inserir uma
--    linha se nomeando inviter_profile_id, com invitee_role='booker',
--    sem checar quem é de fato o destinatário) e usá-lo pra "validar"
--    um segundo cadastro Booker. Fecha o caso que motivou esta
--    correção (curioso que cai no site e cria conta sem fricção
--    nenhuma); não fecha um ataque deliberado via API direta — isso
--    fica pra quando o convite for emitido por uma fonte não
--    auto-inserível pelo próprio usuário (território do Beta Fechado
--    por código, Entrega 2, ainda não desenhada).

revoke execute on function public.add_secondary_role(public.user_role) from authenticated;

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
  claimed_invite_id uuid;
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

  -- Vínculo por link de convite. Booker (06/10/2026): reclama o
  -- convite com UPDATE ... RETURNING atômico — token inválido/vencido/
  -- já reclamado/papel errado ou ausente aborta a conta inteira.
  -- Artista: inalterado, vínculo best-effort, nunca bloqueia.
  invite_token := nullif(trim(meta ->> 'pendingInviteToken'), '');

  if new_role = 'booker' then
    if invite_token is null then
      raise exception 'booker_signup_requires_invite' using errcode = 'P0001';
    end if;

    update public.invites
    set invitee_profile_id = new.id
    where token = invite_token::uuid
      and status = 'pendente'
      and expires_at > now()
      and invitee_profile_id is null
      and invitee_role = 'booker'
    returning id into claimed_invite_id;

    if claimed_invite_id is null then
      raise exception 'booker_signup_requires_invite' using errcode = 'P0001';
    end if;
  elsif invite_token is not null then
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

comment on function public.handle_new_user() is 'Cria profile + profile_roles + extensão de papel + subscription no signUp. A partir de 06/10/2026: cadastro role=booker exige invites pendente/válido/não reclamado com invitee_role=booker — reclamado via UPDATE...RETURNING atômico (concorrência de 2 tentativas pro mesmo token resolvida pela trava de linha do UPDATE), qualquer falha aborta a transação inteira (nenhuma linha gravada). Artista mantém o vínculo best-effort original, nunca bloqueia.';
