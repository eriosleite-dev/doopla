-- Doopla — agência deixa de ser um tipo de conta separado no cadastro.
-- Uma "agência" agora é só um booker que indica, na pergunta de perfil,
-- que representa vários artistas — por isso o campo de roster (número
-- aproximado de artistas representados) migra pra booker_profiles.
--
-- O enum public.user_role e a tabela public.agency_profiles continuam
-- existindo (nada foi apagado), só não são mais alcançáveis pelo
-- cadastro. Evita uma migration destrutiva por uma decisão de produto
-- que pode mudar de novo.

alter table public.booker_profiles
  add column roster text;

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
