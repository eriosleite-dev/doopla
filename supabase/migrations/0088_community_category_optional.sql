-- Doopla — Comunidade: busca universal, sem taxonomia fechada obrigatória.
--
-- Decisão canônica da fundadora (16/09/2026): a Comunidade não deve
-- depender de categorias fixas/obrigatórias — a arquitetura é
-- "tópicos livres → busca universal → resultados relevantes", nunca
-- "categoria → subcategoria → tópico". Auditoria prévia (registrada em
-- PROGRESS.md) confirmou: `search_community_topics` (migration 0068)
-- JÁ faz full-text search real (tsvector, websearch_to_tsquery,
-- ts_rank) sobre título/corpo, usando categoria/tag só como BOOST
-- opcional de ranking, nunca como filtro obrigatório — `p_category_id`
-- já era nullable ali. O único bloqueio real era `category_id NOT
-- NULL` em `community_topics` + a validação de `create_community_topic`
-- que EXIGIA uma categoria pra publicar. Esta migration remove só essa
-- exigência — nenhuma tabela, RPC, constraint ou dado existente é
-- apagado (`community_categories`/`community_topic_tags` continuam
-- intactos, tópicos antigos mantêm sua categoria).

-- ============================================================
-- 1. community_topics.category_id vira nullable. Não-destrutivo:
--    nenhuma linha existente muda (todo tópico já tinha uma categoria
--    válida), só deixa de ser exigido em tópicos NOVOS.
-- ============================================================
alter table public.community_topics
  alter column category_id drop not null;

comment on column public.community_topics.category_id is 'Nullable desde 16/09/2026 (busca universal) — null significa tópico sem categoria escolhida, decisão de produto explícita pra não forçar taxonomia fechada na criação. search_community_topics/get_community_for_you_topics já toleram null (boost condicional, nunca obrigatório).';

-- ============================================================
-- 2. create_community_topic — mesma assinatura, só a validação de
--    categoria passa a ser condicional (só valida SE veio uma). Todo
--    o resto (autenticação, membership ativo, limites de
--    título/corpo/tags) permanece idêntico.
-- ============================================================
create or replace function public.create_community_topic(
  p_title text,
  p_body text,
  p_category_id uuid,
  p_audience text default 'all',
  p_tag_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := trim(p_title);
  v_body text := trim(p_body);
  v_tag_count integer;
  v_topic_id uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.community_profiles
    where profile_id = v_actor and visibility_status = 'active'
  ) then
    raise exception 'community_membership_not_active' using errcode = 'P0001';
  end if;

  if length(v_title) < 3 or length(v_title) > 200 then
    raise exception 'invalid_title' using errcode = 'P0001';
  end if;

  if length(v_body) < 1 or length(v_body) > 8000 then
    raise exception 'invalid_body' using errcode = 'P0001';
  end if;

  if p_audience not in ('niche', 'all') then
    raise exception 'invalid_audience' using errcode = 'P0001';
  end if;

  -- Única mudança de comportamento desta function: categoria agora é
  -- OPCIONAL. Se vier null, pula a validação (nada pra validar). Se
  -- vier preenchida, continua exigindo que seja uma categoria real e
  -- ativa — nunca aceita um id inválido só porque a coluna é nullable.
  if p_category_id is not null and not exists (
    select 1 from public.community_categories where id = p_category_id and active
  ) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;

  v_tag_count := coalesce(array_length(p_tag_ids, 1), 0);
  if v_tag_count > 5 then
    raise exception 'too_many_tags' using errcode = 'P0001';
  end if;

  if v_tag_count > 0 and exists (
    select 1 from unnest(p_tag_ids) as tid
    left join public.community_tags ct on ct.id = tid and ct.active
    where ct.id is null
  ) then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;

  insert into public.community_topics (author_profile_id, title, body, category_id, audience)
  values (v_actor, v_title, v_body, p_category_id, p_audience)
  returning id into v_topic_id;

  if v_tag_count > 0 then
    insert into public.community_topic_tags (topic_id, tag_id)
    select v_topic_id, tid from unnest(p_tag_ids) as tid
    on conflict do nothing;
  end if;

  return v_topic_id;
end;
$$;

comment on function public.create_community_topic is 'Fase 1 (06/09/2026), estendida (16/09/2026, busca universal): categoria passa a ser OPCIONAL — validação só roda quando p_category_id não é null. Mesma autenticação/membership/limites de sempre. Grants inalterados (create or replace nunca reseta grants).';
