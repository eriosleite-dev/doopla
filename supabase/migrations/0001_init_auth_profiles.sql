-- Doopla — Bloco 1: autenticação e perfis (artista, booker, agência)
-- Rode este arquivo no SQL Editor do Supabase (ou via `supabase db push`).

-- 1. Tipo de perfil
create type public.user_role as enum ('artista', 'booker', 'agencia');

-- 2. Tabela base de perfil (1:1 com auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  display_name text,
  phone text,
  city text,
  state text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Dados comuns aos três tipos de conta da Doopla.';

-- 3. Extensões de perfil por tipo de conta
create table public.artist_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  stage_name text,
  bio text,
  genres text[] not null default '{}',
  base_fee_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booker_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  company_name text,
  venue_name text,
  position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agency_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  agency_name text not null,
  cnpj text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. updated_at automático
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.artist_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.booker_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.agency_profiles
  for each row execute function public.set_updated_at();

-- 5. Criação automática do perfil ao cadastrar (auth.users -> public.profiles)
-- Espera que o signup envie em options.data: { role, full_name }
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_role public.user_role;
begin
  new_role := coalesce(new.raw_user_meta_data ->> 'role', 'artista')::public.user_role;

  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    new_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  if new_role = 'artista' then
    insert into public.artist_profiles (profile_id) values (new.id);
  elsif new_role = 'booker' then
    insert into public.booker_profiles (profile_id) values (new.id);
  elsif new_role = 'agencia' then
    insert into public.agency_profiles (profile_id, agency_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Row Level Security — cada usuário só acessa o próprio perfil por enquanto.
-- (Mais adiante, quando o marketplace precisar listar artistas publicamente,
-- adicionamos uma policy de leitura pública com campos limitados.)
alter table public.profiles enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.booker_profiles enable row level security;
alter table public.agency_profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

create policy "artist_profiles: select own" on public.artist_profiles
  for select using (auth.uid() = profile_id);
create policy "artist_profiles: update own" on public.artist_profiles
  for update using (auth.uid() = profile_id);

create policy "booker_profiles: select own" on public.booker_profiles
  for select using (auth.uid() = profile_id);
create policy "booker_profiles: update own" on public.booker_profiles
  for update using (auth.uid() = profile_id);

create policy "agency_profiles: select own" on public.agency_profiles
  for select using (auth.uid() = profile_id);
create policy "agency_profiles: update own" on public.agency_profiles
  for update using (auth.uid() = profile_id);

-- Observação: não há policy de INSERT porque as linhas são criadas pelo
-- trigger `handle_new_user`, que roda como security definer (dono da função),
-- contornando o RLS nesse único caminho controlado.
