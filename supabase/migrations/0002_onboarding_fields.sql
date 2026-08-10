-- Doopla — campos de onboarding migrados do fluxo original do site
-- (as mesmas perguntas por tipo de conta, agora persistidas de verdade).
-- Rode depois de 0001_init_auth_profiles.sql.

alter table public.artist_profiles
  add column intencao text,
  add column pontual_detalhe text,
  add column funcao text,
  add column local text,
  add column mercados text,
  add column tem_booker text;

alter table public.booker_profiles
  add column perfil text,
  add column mercados text,
  add column quem text,
  add column cidades text,
  add column ja_representa text;

alter table public.agency_profiles
  add column roster text,
  add column agentes text,
  add column mercado text;

-- Atualiza a trigger de criação de perfil pra gravar os novos campos,
-- todos vindos de options.data no supabase.auth.signUp (raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_role public.user_role;
  meta jsonb;
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
      profile_id, perfil, mercados, quem, cidades, ja_representa
    ) values (
      new.id,
      meta ->> 'perfil',
      meta ->> 'mercados',
      meta ->> 'quem',
      meta ->> 'cidades',
      meta ->> 'jaRepresenta'
    );
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
