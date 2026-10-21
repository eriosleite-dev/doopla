-- Encerramento de conta — gap encontrado em auditoria de QA (01/10/2026):
-- find_representation_target_by_contact (migration 0033) e
-- find_representation_target_by_public_id (migration 0071) são
-- anteriores ao account closure flow (migration 0078) e nunca
-- filtraram profiles.status. Resultado: uma conta encerrada continuava
-- aparecendo em "Adicionar alguém da equipe" (busca por contato ou por
-- código ID), com nome real exposto — diferente de
-- community_profiles_public, que já anonimiza pra "Usuário removido"
-- desde 0078. Dava pra mandar uma solicitação de conexão pra uma conta
-- fechada, que nunca seria respondida (o dono não consegue mais
-- logar). Fix: as duas RPCs passam a exigir p.status = 'active' no
-- alvo da busca, mesmo critério de "esta conta está realmente
-- alcançável" que o resto do produto já usa. `create or replace`
-- porque a assinatura/formato de retorno não muda — só a condição
-- WHERE.

create or replace function public.find_representation_target_by_contact(p_contact text)
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
  v_contact text := nullif(trim(p_contact), '');
  v_digits text;
begin
  if v_caller is null or v_contact is null then
    return;
  end if;

  select p.role into v_caller_role from public.profiles p where p.id = v_caller;
  if v_caller_role is null then
    return;
  end if;
  v_target_role := case when v_caller_role = 'artista' then 'booker' else 'artista' end;

  v_digits := regexp_replace(v_contact, '\D', '', 'g');

  return query
    select p.id, p.role, p.full_name, p.display_name, p.avatar_url
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.role = v_target_role
      and p.id <> v_caller
      and p.status = 'active'
      and (
        (v_contact like '%@%' and lower(u.email) = lower(v_contact))
        or (length(v_digits) >= 8 and length(coalesce(p.phone, '')) > 0
            and regexp_replace(p.phone, '\D', '', 'g') = v_digits)
      )
    limit 1;
end;
$$;

comment on function public.find_representation_target_by_contact(text) is 'Usado pelo fluxo "Adicionar um Booker/Artista": dado nome+contato informado, descobre se já existe conta (do papel oposto ao de quem chama) pra decidir entre solicitação (conta existe) e convite (conta não existe) sem perguntar ao usuário. Nunca encontra conta encerrada (profiles.status=closed, 0078) — equivalente a ela não existir pra esse fluxo, mesmo critério de alcançável que o resto do produto usa.';

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
      and p.status = 'active'
      and lower(p.slug) = v_public_id
    limit 1;
end;
$$;

comment on function public.find_representation_target_by_public_id(text) is 'Segundo caminho do fluxo "Adicionar um Booker/Artista": busca por ID público estável (profiles.slug) em vez de e-mail/telefone, pro caso de quem está do outro lado preferir compartilhar só o código. Mesmo modelo de segurança de find_representation_target_by_contact, mesma exclusão de conta encerrada (profiles.status=closed, 0078).';
