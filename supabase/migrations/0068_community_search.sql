-- Comunidade — Fase 1 da rodada de UX search-first (06/09/2026).
--
-- Único gap real de infraestrutura identificado na auditoria completa
-- (Web + App + schema, todos lidos linha a linha antes desta migration):
-- 0059_community_core.sql nunca teve tsvector — busca de texto era um
-- gap explicitamente registrado, nunca esquecido. Esta migration fecha
-- só esse gap, sem tocar em nenhuma tabela/RPC/RLS já existente.
--
-- Decisão de ranking (aprovada explicitamente antes de codar): título
-- pesa mais que corpo (weight A vs B), e o texto de categoria/tag
-- vinculada ao tópico também participa do match — uma busca como
-- "DJs que trabalham com casamento" não precisa achar a palavra
-- "casamento" no corpo do tópico pra aparecer; a tag "Casamentos"
-- (migration 0059, vocabulário controlado) já entra na comparação.
-- Isso é "taxonomia por baixo, linguagem natural por cima": a UI nunca
-- obriga o usuário a escolher a tag, mas a busca usa o sinal
-- estruturado que já existe pra melhorar o resultado.
--
-- Decisão de arquitetura: full-text search nativo do Postgres
-- (websearch_to_tsquery), NUNCA embeddings/pgvector — confirmado com o
-- usuário antes de codar. Zero infraestrutura de IA nova. Evolutivo:
-- se um dia for preciso semantic search de verdade, isso troca a
-- função search_community_topics por dentro, sem mudar o contrato
-- (mesmo nome, mesmos parâmetros) — Web e App não precisam saber.
--
-- search_community_topics() é "language sql stable" SEM
-- "security definer" — de propósito. Busca é só leitura de conteúdo
-- já coberto pela RLS "select visible" existente
-- (status = 'published' or author_profile_id = auth.uid()); rodar como
-- invoker deixa o Postgres aplicar essa RLS automaticamente, sem
-- duplicar a regra de visibilidade dentro da função (mesma disciplina
-- de nunca reimplementar o que a RLS já garante).

alter table public.community_topics
  add column search_tsv tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(body, '')), 'B')
  ) stored;

comment on column public.community_topics.search_tsv is 'Fase 1 da busca search-first (06/09/2026) — título pesa mais que corpo (weight A vs B). Gerada/armazenada, nunca calculada em runtime pela aplicação.';

create index community_topics_search_tsv_idx on public.community_topics using gin (search_tsv);

create or replace function public.search_community_topics(
  p_query text,
  p_category_id uuid default null,
  p_tag_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  author_profile_id uuid,
  title text,
  body text,
  category_id uuid,
  audience text,
  status text,
  reply_count integer,
  participant_count integer,
  last_activity_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('portuguese', coalesce(nullif(trim(p_query), ''), '')) as tsq
  )
  select
    t.id, t.author_profile_id, t.title, t.body, t.category_id, t.audience, t.status,
    t.reply_count, t.participant_count, t.last_activity_at, t.created_at, t.updated_at
  from public.community_topics t
  cross join q
  left join public.community_categories c on c.id = t.category_id
  where t.status = 'published'
    and (p_category_id is null or t.category_id = p_category_id)
    and (
      p_tag_id is null
      or exists (
        select 1 from public.community_topic_tags tt0
        where tt0.topic_id = t.id and tt0.tag_id = p_tag_id
      )
    )
    and (
      q.tsq::text = ''
      or t.search_tsv @@ q.tsq
      or to_tsvector('portuguese', coalesce(c.label, '')) @@ q.tsq
      or exists (
        select 1
        from public.community_topic_tags tt1
        join public.community_tags tg1 on tg1.id = tt1.tag_id
        where tt1.topic_id = t.id and to_tsvector('portuguese', tg1.label) @@ q.tsq
      )
    )
  order by
    (
      ts_rank('{0.1,0.2,0.4,1.0}'::float4[], t.search_tsv, q.tsq)
      + case when q.tsq::text <> '' and to_tsvector('portuguese', coalesce(c.label, '')) @@ q.tsq then 0.5 else 0 end
      + case when q.tsq::text <> '' and exists (
          select 1
          from public.community_topic_tags tt2
          join public.community_tags tg2 on tg2.id = tt2.tag_id
          where tt2.topic_id = t.id and to_tsvector('portuguese', tg2.label) @@ q.tsq
        ) then 0.3 else 0 end
    ) desc,
    t.last_activity_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.search_community_topics is 'Fase 1 da busca search-first (06/09/2026) — websearch_to_tsquery(''portuguese'', ...), ranking com peso maior pro título e boost quando a categoria/tag do tópico bate com a busca. SECURITY INVOKER (não definer) de propósito: reaproveita a RLS "select visible" já existente em community_topics, nunca duplica a regra de visibilidade aqui.';

revoke all on function public.search_community_topics(text, uuid, uuid, integer) from public, anon;
grant execute on function public.search_community_topics(text, uuid, uuid, integer) to authenticated;
