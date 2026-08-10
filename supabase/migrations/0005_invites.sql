-- Doopla — convites pra quem já trabalha junto fora da plataforma.
--
-- Distinto da futura "solicitação" (booker descobre um artista e pede pra
-- representar, com limite de 5 pendentes simultâneas — ainda não construída).
-- Convite aqui é pra relação que já existe fora da doopla, sem limite de
-- quantidade, só vira oficial (public.representations) depois que a pessoa
-- convidada confirma.
--
-- Envio de fato (WhatsApp/e-mail) pra quem ainda não tem conta fica em
-- aberto de propósito — decisão adiada. Por enquanto o convite só é
-- gravado; quando o contato bate com uma conta existente, vira uma
-- notificação dentro do app.

create type public.invite_status as enum ('pendente', 'confirmado');

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_profile_id uuid not null references public.profiles (id) on delete cascade,
  invitee_name text not null,
  invitee_contact text not null,
  invitee_profile_id uuid references public.profiles (id) on delete set null,
  status public.invite_status not null default 'pendente',
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

comment on column public.invites.invitee_profile_id is 'Preenchido quando o contato bate com o e-mail de uma conta artista já existente.';
comment on column public.invites.token is 'Reservado pro link de confirmação de quem ainda não tem conta (envio real ainda não implementado).';

create table public.representations (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_via_invite_id uuid references public.invites (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint representations_different_parties check (artist_profile_id <> booker_profile_id),
  unique (artist_profile_id, booker_profile_id)
);

comment on table public.representations is 'Relação oficial artista↔booker, confirmada pelas duas partes.';

alter table public.invites enable row level security;
alter table public.representations enable row level security;

create policy "invites: select related" on public.invites
  for select using (auth.uid() = inviter_profile_id or auth.uid() = invitee_profile_id);
create policy "invites: insert own" on public.invites
  for insert with check (auth.uid() = inviter_profile_id);
create policy "invites: invitee can confirm" on public.invites
  for update using (auth.uid() = invitee_profile_id)
  with check (auth.uid() = invitee_profile_id);

create policy "representations: select own" on public.representations
  for select using (auth.uid() = artist_profile_id or auth.uid() = booker_profile_id);
create policy "representations: insert own" on public.representations
  for insert with check (auth.uid() = artist_profile_id or auth.uid() = booker_profile_id);

-- Atualiza a trigger de criação de perfil pra também criar os convites
-- coletados durante o cadastro do booker (metadata "pendingInvites", um
-- array json de {name, contact}).
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
begin
  meta := new.raw_user_meta_data;
  new_role := coalesce(meta ->> 'role', 'artista')::public.user_role;

  insert into public.profiles (id, role, full_name)
  values (new.id, new_role, coalesce(meta ->> 'full_name', ''));

  if new_role = 'artista' then
    insert into public.artist_profiles (
      profile_id, intencao, pontual_detalhe, funcao, local, mercados, tem_booker
    ) values (
      new.id,
      meta ->> 'intencao',
      meta ->> 'pontualDetalhe',
      meta ->> 'funcao',
      meta ->> 'local',
      meta ->> 'mercados',
      meta ->> 'temBooker'
    );
  elsif new_role = 'booker' then
    insert into public.booker_profiles (
      profile_id, perfil, mercados, quem, cidades, ja_representa, roster
    ) values (
      new.id,
      meta ->> 'perfil',
      meta ->> 'mercados',
      meta ->> 'quem',
      meta ->> 'cidades',
      meta ->> 'jaRepresenta',
      meta ->> 'roster'
    );

    -- pendingInvites chega como texto JSON (metadata do signUp é sempre
    -- string plana), por isso o cast explícito pra jsonb aqui.
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
