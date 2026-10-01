-- Painel Admin V1 (Beta Readiness fechado, próximo bloco do roadmap,
-- escopo aprovado pela fundadora em rodada dedicada de scoping).
--
-- Decisão de segurança central: NUNCA service_role no Admin. Toda
-- autoridade vive dentro de functions SECURITY DEFINER que verificam
-- auth.uid() + profiles.is_admin a cada chamada — nunca confiam em
-- is_admin vindo do client, nunca dependem só do gate de /admin no
-- boundary (que é defesa em profundidade/UX, não a barreira real).
-- Mesmo padrão já usado em close_own_account (0078) e nas policies de
-- opportunity_events (0018): auth.uid() nunca muda dentro de uma
-- function SECURITY DEFINER (não é afetado pelo "security definer",
-- que só troca o role de EXECUÇÃO no servidor — por isso dá pra
-- confiar nele aqui, exatamente como o resto do projeto já confia).
--
-- Fonte de uso/custo de IA: ai_usage_events (gravada de verdade via
-- log_ai_usage_event, chamada pelo Runtime em pipeline.ts/
-- resumption.ts) — NUNCA orchestrator_runs, que só tem metadado de
-- execução (eligible_tools/status/latency), sem tokens. cost_cents_
-- estimate nunca é preenchida hoje e não é usada aqui — o custo é
-- estimado em TypeScript a partir de (model, input_tokens,
-- output_tokens, created_at) contra uma tabela de preço versionada
-- por data efetiva (src/lib/admin/ai-pricing.ts), nunca gravado no
-- banco nesta rodada.
--
-- Verificação feita antes de escrever este arquivo (auditoria de
-- código, não suposição): community_profiles.visibility_status
-- ('active'/'restricted'/'blocked', CHECK inalterado desde 0059) já
-- bloqueia create_community_topic/create_community_post pra quem não
-- está 'active' (ambas checam isso explicitamente). community_topics/
-- community_posts com status='removed_by_moderator' já são excluídos
-- de toda superfície de LISTAGEM (listCommunityTopics,
-- listCommunityTopicsByIds, search_community_topics,
-- get_community_for_you_topics, get_community_trending_topics) e da
-- leitura direta via RLS ("select visible": status='published' OR
-- author_profile_id=auth.uid()) pra qualquer um que não seja o autor.
-- Então as 3 ações de moderação abaixo têm efeito real sobre
-- "usuários comuns" — confirmado, não presumido. Nuance que não é
-- bloqueio: a RLS existente (mesma usada pra remoção pelo próprio
-- autor, não uma exceção nova) deixa o AUTOR de um tópico/post
-- continuar vendo o próprio conteúdo mesmo depois de removido por um
-- moderador (getCommunityTopic/listCommunityPostsPage nunca filtram
-- status explicitamente, só herdam essa RLS) — ele só não aparece mais
-- pra mais ninguém, e o autor não consegue mais receber respostas
-- nele (create_community_post exige topic.status='published').

-- =====================================================================
-- 1. admin_audit_events — trilha mínima e genérica de toda ação
-- administrativa de escrita. Sem policy nenhuma pra authenticated/anon
-- de propósito: só as functions abaixo (SECURITY DEFINER, rodam como
-- owner) escrevem/leem nela.
-- =====================================================================

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles (id),
  action text not null,
  target_table text not null,
  target_id uuid not null,
  previous_state jsonb,
  new_state jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_events is 'Painel Admin V1 — trilha mínima de auditoria (quem/o quê/em quem/antes/depois/motivo/quando) pra toda ação administrativa de escrita. Genérica de propósito (action é texto livre), em vez de espalhar colunas moderated_by/moderated_at por tabela — mais fácil de auditar num lugar só com 1 admin e poucas ações hoje.';
comment on column public.admin_audit_events.action is 'community_profile_visibility_changed | community_topic_removed | community_topic_restored | community_post_removed | community_post_restored (V1). Texto livre pra crescer sem migration nova a cada ação.';

create index admin_audit_events_target_idx on public.admin_audit_events (target_table, target_id);
create index admin_audit_events_admin_idx on public.admin_audit_events (admin_profile_id);
create index admin_audit_events_created_at_idx on public.admin_audit_events (created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public, anon, authenticated;

-- =====================================================================
-- 2. _assert_is_admin() — guard interna reaproveitada por toda
-- function de admin abaixo (mesmo padrão de _create_conversation_core,
-- migration 0082: núcleo interno nunca grantado a anon/authenticated,
-- só chamável função-a-função). Nunca aceita is_admin como parâmetro —
-- sempre relê profiles.id=auth.uid() na hora, nunca confia em nada
-- vindo do client.
-- =====================================================================

create function public._assert_is_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and is_admin) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

comment on function public._assert_is_admin() is 'Guard interna do Painel Admin V1 — nunca grantada a anon/authenticated (só chamável função-a-função). Raise se não autenticado ou profiles.is_admin=false; devolve auth.uid() do admin quando passa, pra as functions chamadoras usarem em admin_profile_id sem reler.';

revoke all on function public._assert_is_admin() from public;
revoke execute on function public._assert_is_admin() from anon, authenticated;

-- =====================================================================
-- 3. Moderação — 3 entidades (perfil/tópico/post), 5 operações
-- (restore entra no V1 de propósito: estado reversível desde o
-- início). Todas exigem reason não vazio, leem o estado anterior com
-- "for update" (evita corrida entre ler e escrever), são no-op
-- auditável-zero quando não há mudança real de estado (idempotente,
-- nunca grava evento falso), e gravam update+audit na mesma
-- transação (uma function plpgsql é sempre atômica por chamada).
-- =====================================================================

create function public.admin_set_community_visibility(
  p_profile_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_old text;
begin
  if p_status not in ('active', 'restricted', 'blocked') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select visibility_status into v_old
    from public.community_profiles
    where profile_id = p_profile_id
    for update;

  if not found then
    raise exception 'community_profile_not_found' using errcode = 'P0002';
  end if;

  if v_old = p_status then
    return;
  end if;

  update public.community_profiles
    set visibility_status = p_status
    where profile_id = p_profile_id;

  insert into public.admin_audit_events
    (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values
    (v_admin, 'community_profile_visibility_changed', 'community_profiles', p_profile_id,
     jsonb_build_object('visibility_status', v_old), jsonb_build_object('visibility_status', p_status), p_reason);
end;
$$;

comment on function public.admin_set_community_visibility(uuid, text, text) is 'Painel Admin V1 — único caminho pra mudar community_profiles.visibility_status fora do próprio trigger de auto-proteção (prevent_self_community_moderation_change, 0059, continua intocado: um admin não consegue moderar o PRÓPRIO perfil de Comunidade por aqui, por design). Efeito real já confirmado: active/restricted/blocked é checado em create_community_topic/create_community_post.';

create function public.admin_remove_community_topic(p_topic_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_old text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status into v_old from public.community_topics where id = p_topic_id for update;
  if not found then
    raise exception 'topic_not_found' using errcode = 'P0002';
  end if;

  if v_old = 'removed_by_moderator' then
    return;
  end if;

  update public.community_topics set status = 'removed_by_moderator' where id = p_topic_id;

  insert into public.admin_audit_events
    (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values
    (v_admin, 'community_topic_removed', 'community_topics', p_topic_id,
     jsonb_build_object('status', v_old), jsonb_build_object('status', 'removed_by_moderator'), p_reason);
end;
$$;

create function public.admin_restore_community_topic(p_topic_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_old text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status into v_old from public.community_topics where id = p_topic_id for update;
  if not found then
    raise exception 'topic_not_found' using errcode = 'P0002';
  end if;

  -- Só desfaz remoção DE MODERADOR. Um tópico removed_by_author nunca
  -- é restaurável por aqui — "restaurar a decisão do próprio autor de
  -- apagar" é um produto diferente, fora de escopo do V1.
  if v_old != 'removed_by_moderator' then
    raise exception 'topic_not_restorable' using errcode = 'P0001';
  end if;

  update public.community_topics set status = 'published' where id = p_topic_id;

  insert into public.admin_audit_events
    (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values
    (v_admin, 'community_topic_restored', 'community_topics', p_topic_id,
     jsonb_build_object('status', v_old), jsonb_build_object('status', 'published'), p_reason);
end;
$$;

create function public.admin_remove_community_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_old text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status into v_old from public.community_posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;

  if v_old = 'removed_by_moderator' then
    return;
  end if;

  update public.community_posts set status = 'removed_by_moderator' where id = p_post_id;

  insert into public.admin_audit_events
    (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values
    (v_admin, 'community_post_removed', 'community_posts', p_post_id,
     jsonb_build_object('status', v_old), jsonb_build_object('status', 'removed_by_moderator'), p_reason);
end;
$$;

create function public.admin_restore_community_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_old text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status into v_old from public.community_posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;

  if v_old != 'removed_by_moderator' then
    raise exception 'post_not_restorable' using errcode = 'P0001';
  end if;

  update public.community_posts set status = 'published' where id = p_post_id;

  insert into public.admin_audit_events
    (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values
    (v_admin, 'community_post_restored', 'community_posts', p_post_id,
     jsonb_build_object('status', v_old), jsonb_build_object('status', 'published'), p_reason);
end;
$$;

-- =====================================================================
-- 4. Leitura — cada function devolve só a projeção necessária (nunca
-- select *), sempre agregada/mínima. auth.users só é alcançável por
-- function SECURITY DEFINER (mesmo padrão de
-- find_representation_target_by_contact, 0033/0095) — nenhuma RLS de
-- usuário comum chega lá.
-- =====================================================================

create function public.admin_search_profiles(p_query text default null, p_limit integer default 50)
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
  select p.id, p.full_name, p.role, u.email, p.phone, p.slug, p.status, p.is_admin, s.status, p.created_at
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

create function public.admin_get_profile_detail(p_profile_id uuid)
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
  select p.id, p.full_name, p.role, u.email, p.phone, p.city, p.state, p.slug, p.status, p.status_changed_at,
         p.is_admin, s.status, s.role, s.trial_ends_at, cp.visibility_status, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.profile_id = p.id
  left join public.community_profiles cp on cp.profile_id = p.id
  where p.id = p_profile_id;
end;
$$;

-- Busca ACROSS as 3 entidades moderáveis, sempre ignorando status (ao
-- contrário de toda query pública do produto) — o admin precisa achar
-- e eventualmente restaurar conteúdo já removido, não só o que está
-- visível hoje.
create function public.admin_search_community_content(p_query text default null, p_limit integer default 30)
returns table (
  entity_type text,
  entity_id uuid,
  author_profile_id uuid,
  author_name text,
  excerpt text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_limit integer := least(coalesce(p_limit, 30), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._assert_is_admin();

  return query
  (
    select 'community_profile'::text, cp.profile_id, cp.profile_id, p.full_name,
           null::text, cp.visibility_status, cp.activated_at
    from public.community_profiles cp
    join public.profiles p on p.id = cp.profile_id
    where v_query is null or p.full_name ilike '%' || v_query || '%'
    order by cp.activated_at desc
    limit v_limit
  )
  union all
  (
    select 'community_topic'::text, t.id, t.author_profile_id, p.full_name,
           left(t.title, 140), t.status, t.created_at
    from public.community_topics t
    join public.profiles p on p.id = t.author_profile_id
    where v_query is null or t.title ilike '%' || v_query || '%' or t.body ilike '%' || v_query || '%'
    order by t.created_at desc
    limit v_limit
  )
  union all
  (
    select 'community_post'::text, po.id, po.author_profile_id, p.full_name,
           left(po.body, 140), po.status, po.created_at
    from public.community_posts po
    join public.profiles p on p.id = po.author_profile_id
    where v_query is null or po.body ilike '%' || v_query || '%'
    order by po.created_at desc
    limit v_limit
  );
end;
$$;

-- Agregado bruto por dia/model/feature/status — nunca linha crua de
-- ai_usage_events (sem conversation_id/profile_id expostos). Preço é
-- calculado em TypeScript (src/lib/admin/ai-pricing.ts) a partir de
-- usage_date, pra aplicar a tabela de preço vigente na data certa
-- mesmo que o preço de um model mude com o tempo.
create function public.admin_get_ai_cost_summary(p_since timestamptz default now() - interval '30 days')
returns table (
  usage_date date,
  model text,
  feature text,
  status text,
  call_count bigint,
  input_tokens bigint,
  output_tokens bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();

  return query
  select e.created_at::date, coalesce(e.model, 'unknown'), e.feature, e.status,
         count(*)::bigint, coalesce(sum(e.input_tokens), 0)::bigint, coalesce(sum(e.output_tokens), 0)::bigint
  from public.ai_usage_events e
  where e.created_at >= p_since
  group by e.created_at::date, coalesce(e.model, 'unknown'), e.feature, e.status
  order by e.created_at::date desc;
end;
$$;

create function public.admin_get_beta_pulse()
returns table (
  active_profiles_count bigint,
  signups_last_7d bigint,
  signups_last_30d bigint,
  product_events_last_7d bigint,
  intervention_moments_last_7d bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();

  return query
  select
    (select count(*) from public.profiles where status = 'active'),
    (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    (select count(*) from public.product_events where occurred_at >= now() - interval '7 days'),
    (select count(*) from public.intervention_moments where created_at >= now() - interval '7 days');
end;
$$;

create function public.admin_list_audit_events(p_limit integer default 50)
returns table (
  id uuid,
  admin_profile_id uuid,
  admin_name text,
  action text,
  target_table text,
  target_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_limit integer := least(coalesce(p_limit, 50), 200);
begin
  perform public._assert_is_admin();

  return query
  select a.id, a.admin_profile_id, p.full_name, a.action, a.target_table, a.target_id,
         a.previous_state, a.new_state, a.reason, a.created_at
  from public.admin_audit_events a
  join public.profiles p on p.id = a.admin_profile_id
  order by a.created_at desc
  limit v_limit;
end;
$$;

-- =====================================================================
-- 5. Grants — todas as functions de admin (nunca _assert_is_admin)
-- vão pra authenticated, nunca anon. A proteção real é a guard
-- interna, que roda primeiro em toda chamada; o grant só permite a
-- tentativa, exatamente como o resto do projeto já faz (ex.:
-- opportunity_events, cujas policies checam is_admin inline em vez de
-- restringir por grant). Revoke explícito de anon por causa do achado
-- documentado em 0041 (default privileges deste projeto concedem
-- EXECUTE direto a anon/authenticated em function nova, "revoke ...
-- from public" sozinho não basta).
-- =====================================================================

revoke all on function public.admin_set_community_visibility(uuid, text, text) from public;
revoke execute on function public.admin_set_community_visibility(uuid, text, text) from anon;
grant execute on function public.admin_set_community_visibility(uuid, text, text) to authenticated;

revoke all on function public.admin_remove_community_topic(uuid, text) from public;
revoke execute on function public.admin_remove_community_topic(uuid, text) from anon;
grant execute on function public.admin_remove_community_topic(uuid, text) to authenticated;

revoke all on function public.admin_restore_community_topic(uuid, text) from public;
revoke execute on function public.admin_restore_community_topic(uuid, text) from anon;
grant execute on function public.admin_restore_community_topic(uuid, text) to authenticated;

revoke all on function public.admin_remove_community_post(uuid, text) from public;
revoke execute on function public.admin_remove_community_post(uuid, text) from anon;
grant execute on function public.admin_remove_community_post(uuid, text) to authenticated;

revoke all on function public.admin_restore_community_post(uuid, text) from public;
revoke execute on function public.admin_restore_community_post(uuid, text) from anon;
grant execute on function public.admin_restore_community_post(uuid, text) to authenticated;

revoke all on function public.admin_search_profiles(text, integer) from public;
revoke execute on function public.admin_search_profiles(text, integer) from anon;
grant execute on function public.admin_search_profiles(text, integer) to authenticated;

revoke all on function public.admin_get_profile_detail(uuid) from public;
revoke execute on function public.admin_get_profile_detail(uuid) from anon;
grant execute on function public.admin_get_profile_detail(uuid) to authenticated;

revoke all on function public.admin_search_community_content(text, integer) from public;
revoke execute on function public.admin_search_community_content(text, integer) from anon;
grant execute on function public.admin_search_community_content(text, integer) to authenticated;

revoke all on function public.admin_get_ai_cost_summary(timestamptz) from public;
revoke execute on function public.admin_get_ai_cost_summary(timestamptz) from anon;
grant execute on function public.admin_get_ai_cost_summary(timestamptz) to authenticated;

revoke all on function public.admin_get_beta_pulse() from public;
revoke execute on function public.admin_get_beta_pulse() from anon;
grant execute on function public.admin_get_beta_pulse() to authenticated;

revoke all on function public.admin_list_audit_events(integer) from public;
revoke execute on function public.admin_list_audit_events(integer) from anon;
grant execute on function public.admin_list_audit_events(integer) to authenticated;
