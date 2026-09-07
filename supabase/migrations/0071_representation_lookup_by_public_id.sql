-- Booker existente: ID público estável + fluxo "Adicionar profissional"
-- (07/09/2026). O fluxo "Adicionar um Booker/Artista" já existia
-- (AddConnectionModal -> lookupContactAction -> find_representation_
-- target_by_contact -> representation_requests quando a conta já
-- existe, invite/token só quando não existe — migration 0033). O gap
-- era que a única forma de achar uma conta já existente era por e-mail
-- ou telefone, algo que a pessoa do outro lado pode não querer
-- informar. Este arquivo adiciona um segundo caminho de busca, pelo ID
-- público estável (profiles.slug, agora gerado pra QUALQUER papel —
-- ver src/lib/public-id.ts), sem substituir o de contato.
--
-- Mesmo modelo de segurança de find_representation_target_by_contact:
-- security definer, gated por auth.uid(), só devolve o papel OPOSTO ao
-- de quem chama, nunca inclui a própria conta, um resultado por vez.

create or replace function public.find_representation_target_by_public_id(p_public_id text)
returns table (
  profile_id uuid,
  role public.user_role,
  full_name text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role public.user_role;
  v_target_role public.user_role;
  v_public_id text := lower(nullif(trim(p_public_id), ''));
begin
  if v_caller is null or v_public_id is null then
    return;
  end if;

  select p.role into v_caller_role from public.profiles p where p.id = v_caller;
  if v_caller_role is null then
    return;
  end if;
  v_target_role := case when v_caller_role = 'artista' then 'booker' else 'artista' end;

  return query
    select p.id, p.role, p.full_name, p.display_name, p.avatar_url
    from public.profiles p
    where p.role = v_target_role
      and p.id <> v_caller
      and lower(p.slug) = v_public_id
    limit 1;
end;
$$;

comment on function public.find_representation_target_by_public_id(text) is 'Segundo caminho do fluxo "Adicionar um Booker/Artista": busca por ID público estável (profiles.slug) em vez de e-mail/telefone, pro caso de quem está do outro lado preferir compartilhar só o código. Mesmo modelo de segurança de find_representation_target_by_contact.';

grant execute on function public.find_representation_target_by_public_id(text) to authenticated;
