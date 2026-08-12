-- Doopla — Bloco A: identidade pública básica do artista (nome artístico,
-- categoria, bio) e convite só por nome no cadastro do booker.
--
-- `stage_name`/`bio` já existiam desde 0001 (reservados pro perfil público
-- do Bloco C), mas nunca eram preenchidos pelo cadastro. Passam a ser
-- alimentados pelo próprio wizard, sem perguntar de novo o que já foi
-- coletado (nome vira stage_name, "onde atua" continua sendo `local`).
--
-- `invitee_contact` vira opcional: o novo fluxo "já tem artista" do
-- cadastro do booker coleta só o nome (Enter vira chip); contato de quem
-- ainda não tem conta fica pro envio de verdade, que é o Bloco 3.

alter table public.artist_profiles
  add column category text;

alter table public.invites
  alter column invitee_contact drop not null;

comment on column public.invites.invitee_contact is 'Opcional — o cadastro do booker hoje só coleta o nome. Contato é preenchido quando o envio real (Bloco 3) existir.';

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
      profile_id, stage_name, category, bio,
      intencao, pontual_detalhe, funcao, local, mercados, tem_booker
    ) values (
      new.id,
      meta ->> 'full_name',
      meta ->> 'categoria',
      meta ->> 'bio',
      meta ->> 'intencao',
      meta ->> 'pontualDetalhe',
      meta ->> 'funcao',
      meta ->> 'local',
      meta ->> 'mercados',
      meta ->> 'temBooker'
    );
  elsif new_role = 'booker' then
    insert into public.booker_profiles (
      profile_id, perfil, foco, mercados, quem, cidades, ja_representa, roster
    ) values (
      new.id,
      meta ->> 'perfil',
      meta ->> 'foco',
      meta ->> 'mercados',
      meta ->> 'quem',
      meta ->> 'cidades',
      meta ->> 'jaRepresenta',
      meta ->> 'roster'
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
