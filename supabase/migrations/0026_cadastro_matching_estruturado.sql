-- Doopla — Prioridade 2 do bloco cadastro/matching/relação: refazer o
-- onboarding de artista e booker com campos estruturados suficientes pro
-- matching (não texto livre). Também dá suporte ao convite de
-- booker↔artista já dentro do cadastro (opcional, nunca bloqueia).

alter table public.artist_profiles
  add column work_types text[] not null default '{}',
  add column client_types text[] not null default '{}',
  add column regions text[] not null default '{}',
  add column languages text[] not null default '{}',
  add column career_stage text,
  add column help_areas text[] not null default '{}',
  add column fee_range text;

comment on column public.artist_profiles.work_types is 'Tipos de trabalho que costuma fazer (shows, casamentos, festas corporativas...). Estruturado pra matching, não texto livre.';
comment on column public.artist_profiles.client_types is 'Tipos de cliente/evento que costuma atender.';
comment on column public.artist_profiles.regions is 'Regiões geográficas onde atua — distinto de `mercados`, que é nicho/vertical (clubs, festivais, marcas...).';
comment on column public.artist_profiles.help_areas is 'Em quais atividades precisa de ajuda de um booker: negociação, prospecção, cobrança, contratos, organização, atendimento, fechamento, outras.';
comment on column public.artist_profiles.fee_range is 'Faixa de cachê/ticket médio, como rótulo de banda pré-definida (ex: "R$2.000 – R$5.000"), não valor exato.';

alter table public.booker_profiles
  add column artist_categories text[] not null default '{}',
  add column client_types text[] not null default '{}',
  add column regions text[] not null default '{}',
  add column languages text[] not null default '{}',
  add column specialty_areas text[] not null default '{}',
  add column capacity text,
  add column fee_range text,
  add column website_url text;

comment on column public.booker_profiles.artist_categories is 'Categorias de artista com quem trabalha (DJ, músico, fotógrafo...).';
comment on column public.booker_profiles.client_types is 'Tipos de trabalho/cliente que domina.';
comment on column public.booker_profiles.specialty_areas is 'Especialidades estruturadas (negociação, comercial, prospecção, contratos, cobrança, organização, atendimento, fechamento, outras) — substitui o campo `specialties` (texto livre) como fonte usada pelo matching. A coluna antiga continua existindo, só não é mais escrita pelo cadastro/perfil.';
comment on column public.booker_profiles.capacity is 'Quantidade aproximada de artistas que consegue atender agora, como faixa (ex: "4-10 artistas"), não contagem exata.';
comment on column public.booker_profiles.fee_range is 'Faixa de cachê dos artistas com quem costuma trabalhar, mesmo formato de rótulo do lado do artista.';

-- =====================================================================
-- Convite bidirecional: até aqui `invites` só suportava booker convidando
-- artista. Agora o artista também pode convidar um booker durante o
-- cadastro ("Traga sua dupla pra doopla") ou a qualquer momento depois,
-- em Meus Bookers. `confirmInviteAction` passa a olhar o papel de quem
-- convidou pra decidir em que direção a `representations` nasce.
-- =====================================================================

comment on column public.invites.inviter_profile_id is 'Quem enviou o convite — pode ser um booker convidando um artista (fluxo original) ou um artista convidando um booker (novo). A direção da representação nascida a partir daqui é resolvida em runtime pelo papel de cada parte, não fixa no schema.';

-- =====================================================================
-- handle_new_user(): grava os novos campos estruturados a partir da
-- metadata do signUp. Campos de seleção múltipla chegam como JSON array
-- (não string separada por vírgula) pra virar text[] de verdade, não
-- texto livre disfarçado.
-- =====================================================================

create or replace function public.jsonb_text_array(raw text)
returns text[]
language plpgsql
immutable
as $$
begin
  if raw is null or raw = '' then
    return '{}'::text[];
  end if;
  return coalesce(array(select jsonb_array_elements_text(raw::jsonb)), '{}'::text[]);
exception when others then
  -- Campo opcional malformado nunca deve derrubar o cadastro inteiro.
  return '{}'::text[];
end;
$$;

comment on function public.jsonb_text_array is 'Converte um JSON array (string) vindo da metadata do signUp em text[]. Retorna array vazio se a entrada for nula/vazia/inválida — nunca falha o cadastro por um campo opcional malformado.';

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
      public.jsonb_text_array(meta ->> 'clientTypes'),
      public.jsonb_text_array(meta ->> 'regions'),
      public.jsonb_text_array(meta ->> 'languages'),
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
  elsif new_role = 'booker' then
    insert into public.booker_profiles (
      profile_id, modo_trabalho, perfil, foco, mercados, quem, cidades, ja_representa, roster,
      artist_categories, client_types, regions, languages, specialty_areas, capacity, fee_range
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
      meta ->> 'feeRange'
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
          invite ->> 'contact',
          matched_profile_id
        );
      end loop;
    end if;
  elsif new_role = 'agencia' then
    insert into public.agency_profiles (
      profile_id, agency_name, roster, agentes, mercado
    ) values (
      new.id,
      coalesce(meta ->> 'agencia', meta ->> 'full_name', ''),
      meta ->> 'roster',
      meta ->> 'agentes',
      meta ->> 'mercado'
    );
  end if;

  return new;
end;
$$;
