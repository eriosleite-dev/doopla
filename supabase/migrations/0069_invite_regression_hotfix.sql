-- Doopla — Convite Booker <-> profissional: hotfix da regressão de
-- pendingInviteToken + validade de 24h + reenvio seguro + papel
-- solicitado explícito.
--
-- Regressão confirmada (auditoria-mestre, 07/09/2026): o vínculo por
-- invites.token no cadastro (introduzido em
-- 0034_convite_agencia_token.sql, dentro do branch 'artista' de
-- handle_new_user) foi perdido quando 0036_artist_plan_doopla_pro.sql
-- reescreveu handle_new_user pra adicionar artistPlan e não recopiou
-- aquele trecho. Nunca existiu no branch 'booker'. Resultado real
-- confirmado direto no banco: hoje ninguém que se cadastra por
-- /convite/[token] tem invitee_profile_id vinculado automaticamente,
-- em nenhuma direção — o convite fica pendente pra sempre, mesmo
-- alguém completando o cadastro pelo link.
--
-- Escopo deliberadamente contido: isto restaura/espelha um
-- comportamento que já existiu, pra um vínculo de PAPEL ÚNICO (quem
-- aceita continua virando exatamente artista OU booker, nunca os
-- dois). Nada aqui pressupõe ou depende de profile_roles/multi-role.

alter type public.invite_status add value if not exists 'expirada';

-- Papel explicitamente solicitado no convite — nunca mais inferido
-- como "oposto de inviter_role" em tempo de leitura (o pedido era
-- não depender permanentemente dessa inferência se pudermos
-- representar isso corretamente; aqui representamos). Convites
-- existentes são backfilled pela regra que já valia até agora (é a
-- única informação disponível pra eles).
alter table public.invites
  add column invitee_role public.user_role;

update public.invites i
  set invitee_role = (case when p.role = 'artista' then 'booker' else 'artista' end)::public.user_role
  from public.profiles p
  where p.id = i.inviter_profile_id
    and i.invitee_role is null;

alter table public.invites
  alter column invitee_role set not null;

comment on column public.invites.invitee_role is 'Papel que o convite pede pro convidado assumir, gravado explicitamente na criação. Nunca inferido do inviter_role na leitura — é o que handle_new_user usa pra decidir se um pendingInviteToken pode vincular, e o que /convite/[token] usa pra saber pra qual tipo de cadastro mandar.';

-- Validade de 24h (item explicitamente pedido). expires_at é calculado
-- na criação; só é reescrito de verdade num reenvio (resend_invite).
alter table public.invites
  add column expires_at timestamptz,
  add column resend_count integer not null default 0,
  add column last_resent_at timestamptz;

update public.invites
  set expires_at = created_at + interval '24 hours'
  where expires_at is null;

alter table public.invites
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '24 hours');

comment on column public.invites.expires_at is 'Token só é aceitável em handle_new_user/get_invite_by_token enquanto now() < expires_at. Convites pendentes vencidos viram status=expirada via expire_stale_invites (mesmo padrão de expire_stale_representation_requests, 0018).';
comment on column public.invites.resend_count is 'Quantas vezes o token foi reemitido via resend_invite — auditoria, nunca resetado.';
comment on column public.invites.last_resent_at is 'Timestamp do reenvio mais recente, null se nunca reenviado.';

create index invites_token_idx on public.invites (token);

-- Varre convites pendentes vencidos -> 'expirada'. Sem cron ainda —
-- mesmo caminho já estabelecido em expire_stale_representation_requests
-- (0018): quem for consultar convites chama isso antes.
create function public.expire_stale_invites()
returns void
language sql
security definer set search_path = public
as $$
  update public.invites
  set status = 'expirada'
  where status = 'pendente' and expires_at <= now();
$$;

comment on function public.expire_stale_invites() is 'Sweep sob demanda (sem cron): chamado antes de listar convites, mesmo padrão de expire_stale_representation_requests.';

grant execute on function public.expire_stale_invites() to authenticated;

-- Reenvio: regenera token/validade NA MESMA linha (id, histórico e
-- resend_count preservados). O token anterior fica inválido só por não
-- existir mais em nenhuma linha da tabela — sem precisar de blocklist
-- nem de uma segunda linha concorrente pro mesmo convite. Só o próprio
-- inviter pode reenviar, e só um convite que ainda não foi confirmado
-- (reenviar um convite já aceito não faz sentido).
create function public.resend_invite(p_invite_id uuid)
returns table (new_token uuid, new_expires_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite
  from public.invites
  where id = p_invite_id and inviter_profile_id = auth.uid()
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  if v_invite.status = 'confirmado' then
    raise exception 'invite_already_confirmed' using errcode = 'P0001';
  end if;

  return query
    update public.invites
    set token = gen_random_uuid(),
        expires_at = now() + interval '24 hours',
        status = 'pendente',
        resend_count = invites.resend_count + 1,
        last_resent_at = now()
    where id = p_invite_id
    returning invites.token, invites.expires_at;
end;
$$;

comment on function public.resend_invite(uuid) is 'Único ponto que reemite token/validade de um convite. Regenera na mesma linha — token anterior nunca mais resolve nada, sem sistema paralelo de blocklist.';

grant execute on function public.resend_invite(uuid) to authenticated;

-- get_invite_by_token: agora também informa se já venceu (pra
-- /convite/[token] mostrar "expirado" de verdade, não um 404 genérico)
-- e devolve invitee_role explícito, pro CTA não depender de
-- "oposto do inviter_role". Continua nunca vazando nada de um convite
-- já confirmado. Shape do retorno mudou (2 colunas novas) — Postgres
-- exige DROP antes de recriar quando os OUT params mudam de forma.
drop function if exists public.get_invite_by_token(uuid);

create function public.get_invite_by_token(p_token uuid)
returns table (
  inviter_name text,
  inviter_role public.user_role,
  invitee_name text,
  invitee_role public.user_role,
  is_expired boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.full_name,
    p.role,
    i.invitee_name,
    i.invitee_role,
    (i.status = 'expirada' or (i.status = 'pendente' and i.expires_at <= now()))
  from public.invites i
  join public.profiles p on p.id = i.inviter_profile_id
  where i.token = p_token and i.status in ('pendente', 'expirada')
  limit 1;
$$;

comment on function public.get_invite_by_token(uuid) is 'Agora também resolve convite pendente já vencido (mas ainda não varrido pelo sweep) como expirado (is_expired), e devolve invitee_role explícito. Continua nunca retornando convite confirmado.';

grant execute on function public.get_invite_by_token(uuid) to anon, authenticated;

-- handle_new_user: restaura o vínculo por pendingInviteToken (perdido
-- em 0036) e ESPELHA no branch booker (nunca existiu). Escrito como UM
-- bloco só, antes do if/elsif de role, filtrado por
-- invitee_role = new_role — nunca vincula um token pra um papel que
-- não é o que o convite pediu, e nunca duplica a lógica entre os dois
-- branches (a causa raiz da regressão original foi justamente uma
-- reescrita que esqueceu de recopiar um bloco duplicado). Token vencido
-- nunca vincula, mesmo que o cadastro seja concluído — a pessoa só não
-- fica ligada a ninguém automaticamente; o convite continua expirado
-- pro remetente reenviar. Aceite continua 100% separado e explícito
-- (confirmInviteAction) — isto só resolve invitee_profile_id, o mesmo
-- "achar a pessoa certa" que o match por e-mail já fazia, nunca cria
-- representations sozinho.
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
