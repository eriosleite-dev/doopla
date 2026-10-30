-- Painel Admin V1 — correção de bug real achado em QA manual contra
-- doopla-qa-staging (01/10/2026): `admin_search_profiles` e
-- `admin_get_profile_detail` (migration 0096) declaram a coluna
-- `email` como `text` no RETURNS TABLE, mas `auth.users.email` é
-- `character varying(255)` — RETURN QUERY exige o MESMO tipo (OID),
-- não aceita o cast implícito que uma atribuição comum aceitaria.
-- Erro real reproduzido: `42804 — Returned type character varying(255)
-- does not match expected type text in column 4`. Corrigido com
-- `u.email::text` explícito nas duas functions. create or replace
-- preserva grants existentes — não precisa repetir revoke/grant.

create or replace function public.admin_search_profiles(p_query text default null, p_limit integer default 50)
returns table (
  profile_id uuid,
  full_name text,
  role public.user_role,
  email text,
  phone text,
  slug text,
  status public.profile_status,
  is_admin boolean,
  plan_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_limit integer := least(coalesce(p_limit, 50), 200);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._assert_is_admin();

  return query
  select p.id, p.full_name, p.role, u.email::text, p.phone, p.slug, p.status, p.is_admin, s.status, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.profile_id = p.id
  where v_query is null
     or p.full_name ilike '%' || v_query || '%'
     or p.phone ilike '%' || v_query || '%'
     or p.slug ilike '%' || v_query || '%'
     or u.email ilike '%' || v_query || '%'
  order by p.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.admin_get_profile_detail(p_profile_id uuid)
returns table (
  profile_id uuid,
  full_name text,
  role public.user_role,
  email text,
  phone text,
  city text,
  state text,
  slug text,
  status public.profile_status,
  status_changed_at timestamptz,
  is_admin boolean,
  plan_status text,
  plan_role public.user_role,
  trial_ends_at date,
  community_visibility_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();

  return query
  select p.id, p.full_name, p.role, u.email::text, p.phone, p.city, p.state, p.slug, p.status, p.status_changed_at,
         p.is_admin, s.status, s.role, s.trial_ends_at, cp.visibility_status, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.profile_id = p.id
  left join public.community_profiles cp on cp.profile_id = p.id
  where p.id = p_profile_id;
end;
$$;
