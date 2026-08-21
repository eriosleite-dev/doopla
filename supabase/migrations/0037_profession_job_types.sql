-- Doopla — profession_job_types: tipos de trabalho por profissão, como
-- dado no banco, não lista fixa no componente de onboarding.
--
-- Motivo (pedido explícito do usuário, arquitetura não é detalhe de
-- front): cadastrar uma profissão nova (ex: banda, videomaker) precisa
-- ser inserir linhas aqui, nunca mexer no componente React de
-- "Prepare sua Doopla". A tela lê as opções de "professions" e
-- "profession_job_types" em vez de importar de um arquivo TS estático.
--
-- V1 com poucas profissões (as mesmas 7 já usadas na tela: DJ, Banda,
-- Cantor(a), Fotógrafo(a), Videomaker, Influenciador(a)/creator, Outro)
-- — a estrutura já suporta adicionar mais sem migration de schema, só
-- insert de dados.

create table public.professions (
  id text primary key,
  label text not null,
  sort_order integer not null default 0
);

comment on table public.professions is 'Profissões selecionáveis em "Prepare sua Doopla". id é o valor gravado em artist_profiles.category.';

create table public.profession_job_types (
  id uuid primary key default gen_random_uuid(),
  profession_id text not null references public.professions (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

comment on table public.profession_job_types is 'Opções de "que tipos de trabalho você faz" específicas de cada profissão — motor de renderização do onboarding lê daqui, nunca hardcoded no componente.';

create index profession_job_types_profession_id_idx on public.profession_job_types (profession_id);

alter table public.professions enable row level security;
alter table public.profession_job_types enable row level security;

-- Leitura pública: precisa renderizar as opções no cadastro, antes de
-- qualquer sessão existir de verdade (etapa "Prepare sua Doopla" já
-- roda autenticado, mas não há razão pra restringir — não é dado
-- sensível). Sem policy de escrita: gerenciado só por quem tem acesso
-- direto ao banco por enquanto (sem admin UI ainda).
create policy "professions: select all" on public.professions
  for select using (true);
create policy "profession_job_types: select all" on public.profession_job_types
  for select using (true);

insert into public.professions (id, label, sort_order) values
  ('dj', 'DJ', 1),
  ('banda', 'Banda', 2),
  ('cantor', 'Cantor(a)', 3),
  ('fotografo', 'Fotógrafo(a)', 4),
  ('videomaker', 'Videomaker', 5),
  ('influenciador', 'Influenciador(a) / creator', 6),
  ('outro', 'Outro', 7);

insert into public.profession_job_types (profession_id, label, sort_order) values
  ('dj', 'Clubes e festas', 1),
  ('dj', 'Festivais', 2),
  ('dj', 'Eventos corporativos', 3),
  ('dj', 'Marcas e ativações', 4),
  ('dj', 'Casamentos', 5),
  ('dj', 'Eventos privados', 6),
  ('dj', 'Restaurantes/hotéis', 7),
  ('dj', 'Outros', 8),

  ('banda', 'Casamentos', 1),
  ('banda', 'Eventos corporativos', 2),
  ('banda', 'Festivais', 3),
  ('banda', 'Bares e casas de show', 4),
  ('banda', 'Eventos privados', 5),
  ('banda', 'Outros', 6),

  ('cantor', 'Casamentos', 1),
  ('cantor', 'Eventos corporativos', 2),
  ('cantor', 'Festivais', 3),
  ('cantor', 'Bares e casas de show', 4),
  ('cantor', 'Eventos privados', 5),
  ('cantor', 'Outros', 6),

  ('fotografo', 'Casamentos', 1),
  ('fotografo', 'Ensaios', 2),
  ('fotografo', 'Eventos corporativos', 3),
  ('fotografo', 'Moda e campanhas', 4),
  ('fotografo', 'Produtos', 5),
  ('fotografo', 'Outros', 6),

  ('videomaker', 'Casamentos', 1),
  ('videomaker', 'Eventos corporativos', 2),
  ('videomaker', 'Campanhas e publicidade', 3),
  ('videomaker', 'Conteúdo para redes sociais', 4),
  ('videomaker', 'Outros', 5),

  ('influenciador', 'Publis e parcerias com marcas', 1),
  ('influenciador', 'Eventos', 2),
  ('influenciador', 'Campanhas', 3),
  ('influenciador', 'Outros', 4),

  ('outro', 'Eventos corporativos', 1),
  ('outro', 'Marcas e ativações', 2),
  ('outro', 'Eventos privados', 3),
  ('outro', 'Outros', 4);

-- Doopla — campos novos de artist_profiles pro onboarding reconstruído
-- (etapas Cachê / Como você trabalha / Canal de atenção). Contexto
-- comercial (bio, etapa "Prepare sua Doopla") e regra de negociação
-- (negotiation_notes, etapa "Como você trabalha") são semanticamente
-- diferentes mesmo aceitando o mesmo formato de resposta — por isso
-- ficam em colunas separadas, nunca concatenadas.
alter table public.artist_profiles
  add column fee_varies_by_job_type boolean,
  add column issues_invoice boolean,
  add column typical_job_duration text,
  add column negotiation_notes text,
  add column attention_channel text check (attention_channel in ('whatsapp', 'painel', 'ambos'));

comment on column public.artist_profiles.fee_varies_by_job_type is 'Etapa Cachê: se o cachê muda por tipo de trabalho. Detalhamento por categoria fica pro painel, não no onboarding.';
comment on column public.artist_profiles.issues_invoice is 'Etapa Como você trabalha: emite nota fiscal (sim/não).';
comment on column public.artist_profiles.typical_job_duration is 'Etapa Como você trabalha: duração típica do trabalho.';
comment on column public.artist_profiles.negotiation_notes is 'Etapa Como você trabalha: "tem algo que sua Doopla sempre deve saber antes de negociar por você" — regra de representação/negociação, DIFERENTE do contexto comercial em bio (que é intenção/preferência, ex: "quero mais eventos de marca"). Nunca concatenar os dois.';
comment on column public.artist_profiles.attention_channel is 'Etapa Canal de atenção: whatsapp, painel ou ambos.';

-- base_fee_cents (já existe, migration inicial) é reaproveitado como
-- cachê de referência da etapa Cachê — null continua significando
-- "ainda não informado", sem precisar de coluna extra pra isso.

-- Etapa 1 (Criar conta) ganha WhatsApp — profiles.phone já existe desde
-- a migration inicial, só a trigger nunca preenchia. Grava a partir de
-- meta ->> 'whatsapp' (enviado pelo createAccountAction).
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
