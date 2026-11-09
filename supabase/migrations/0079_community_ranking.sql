-- Doopla — Comunidade V2: ranking V1 determinístico para "Em alta
-- agora" e "Para você" (08/09/2026). Nenhum LLM/ML decide ordem —
-- fórmulas puras, auditáveis, parâmetros centralizados dentro de cada
-- function (nunca espalhados pelo código chamador; ajustar o ranking
-- no futuro é editar só este arquivo).
--
-- "Em alta agora" = momentum coletivo recente, nunca personalizado.
-- "Para você" = relevância pessoal estimada a partir de sinais REAIS
-- já existentes (salvos + participação própria) — nunca telemetria
-- inventada. Cold start (nenhum salvo/participação) devolve conjunto
-- vazio de propósito — o caller (Home) omite a seção em vez de fingir
-- personalização (decisão de produto da rodada).

-- =====================================================================
-- Índice de suporte — trending precisa filtrar community_posts por
-- created_at recente; nenhum índice cobria essa coluna até aqui.
-- =====================================================================
create index community_posts_created_at_idx on public.community_posts (created_at);

-- =====================================================================
-- "Em alta agora" — get_community_trending_topics()
--
-- Parâmetros do ranking (documentados aqui, únicos no código):
--   TRENDING_WINDOW_HOURS = 72   — só eventos (posts/abertura do
--     tópico) dentro das últimas 72h contam pro momentum.
--   DECAY_HALF_LIFE_HOURS = 24   — cada evento perde metade do peso a
--     cada 24h dentro da janela (mais recente pesa mais).
--   SAVE_WEIGHT = 0.5            — cada salvo soma um pouco ao score,
--     nunca domina (sinal fraco de confirmação, não de momentum).
--   MIN_UNIQUE_PARTICIPANTS = 2  — sem pelo menos 2 pessoas diferentes
--     participando na janela recente não é "conversa" — nunca aparece
--     como "Em alta".
--   MIN_TRENDING_SCORE = 0.6     — score mínimo pra justificar
--     semanticamente "Em alta" (evita 1º colocado matemático com
--     atividade insignificante virar destaque).
--
-- Diversidade de participação: activity_score é multiplicado por
-- (participantes_únicos / eventos_totais) — 30 mensagens entre 2
-- pessoas tem diversity_factor baixo (dampened), 12 profissionais
-- diferentes com 1 mensagem cada tem diversity_factor = 1 (sem
-- penalidade). Implementa a proteção contra inflação artificial pedida
-- sem sistema anti-fraude — só aritmética.
--
-- Toda a matemática de decay roda em double precision (exp/ln exigem
-- float8) — só o resultado final vira numeric, no round(). Views
-- (participações passivas) não existem no schema hoje — não entram no
-- score por não termos esse dado.
create or replace function public.get_community_trending_topics(p_limit integer default 6)
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
  updated_at timestamptz,
  trending_score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      72.0::float8 as window_hours,
      24.0::float8 as half_life_hours,
      0.5::float8 as save_weight,
      2 as min_unique_participants,
      0.6::float8 as min_score
  ),
  recent_events as (
    -- Abertura do tópico conta como o primeiro evento, mesmo peso de
    -- uma resposta — evita que um tópico novo com poucas respostas
    -- rápidas fique invisível só por reply_count ainda baixo.
    select t.id as topic_id, t.author_profile_id, t.created_at
    from public.community_topics t, params
    where t.status = 'published' and t.created_at >= now() - (params.window_hours || ' hours')::interval
    union all
    select p.topic_id, p.author_profile_id, p.created_at
    from public.community_posts p, params
    where p.status = 'published' and p.created_at >= now() - (params.window_hours || ' hours')::interval
  ),
  scored as (
    select
      e.topic_id,
      count(*) as total_events,
      count(distinct e.author_profile_id) as unique_participants,
      sum(exp((-ln(2)) * (extract(epoch from (now() - e.created_at)) / 3600.0) / params.half_life_hours)) as activity_score
    from recent_events e, params
    group by e.topic_id
  ),
  saves as (
    select topic_id, count(*) as save_count
    from public.community_saved_topics
    group by topic_id
  ),
  final as (
    select
      s.topic_id,
      (s.activity_score * (s.unique_participants::float8 / greatest(s.total_events, 1)))
        + (coalesce(sv.save_count, 0)::float8 * params.save_weight) as score,
      s.unique_participants
    from scored s
    left join saves sv on sv.topic_id = s.topic_id
    cross join params
  )
  select
    t.id, t.author_profile_id, t.title, t.body, t.category_id, t.audience, t.status,
    t.reply_count, t.participant_count, t.last_activity_at, t.created_at, t.updated_at,
    round(f.score::numeric, 4) as trending_score
  from final f
  join public.community_topics t on t.id = f.topic_id
  cross join params
  where t.status = 'published'
    and f.unique_participants >= params.min_unique_participants
    and f.score >= params.min_score
  order by trending_score desc, t.last_activity_at desc, t.id asc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.get_community_trending_topics(integer) is 'Ranking V1 de "Em alta agora" — determinístico, sem LLM. Parâmetros (janela/decay/threshold) documentados no corpo da function, únicos no código.';

revoke all on function public.get_community_trending_topics(integer) from public, anon;
grant execute on function public.get_community_trending_topics(integer) to authenticated;

-- =====================================================================
-- "Para você" — get_community_for_you_topics()
--
-- Sinais REAIS auditados antes de codar (únicos usados no V1):
--   1. categoria dos tópicos que o profissional salvou ou em que
--      participou (autor do tópico OU autor de alguma resposta).
--   2. tags dos mesmos tópicos.
-- Sinais avaliados e DESCARTADOS por falta de dado confiável hoje:
--   - profissão/nicho (artist_profiles.category): não existe
--     mapeamento real entre profissão e community_categories
--     (taxonomias independentes, sem tabela de relação) — usar isso
--     seria inventar uma correlação que não existe;
--   - buscas recentes: não há armazenamento de histórico de busca da
--     Comunidade hoje;
--   - localização: sem sinal de relevância geográfica real pra
--     conteúdo da Comunidade.
--
-- Cold start: profissional sem NENHUM salvo/participação devolve
-- conjunto vazio, de propósito — o caller (Home) omite a seção em vez
-- de fingir personalização ou reaproveitar Recentes disfarçado.
--
-- Pesos (únicos no código, documentados aqui):
--   CATEGORY_WEIGHT = 2.0            — bate a categoria de afinidade.
--   TAG_WEIGHT = 1.0                 — cada tag de afinidade que bate.
--   RECENCY_WEIGHT = 0.5             — peso pequeno, só desempate/leve
--     viés de atividade recente — nunca domina relevância pessoal.
--   RECENCY_HALF_LIFE_HOURS = 168 (7 dias).
--
-- auth.uid() é sempre a fonte de identidade — sem parâmetro de
-- profile_id vindo do client (mesmo idioma de update_community_profile/
-- close_own_account).
create or replace function public.get_community_for_you_topics(p_limit integer default 6)
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
  updated_at timestamptz,
  for_you_score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      2.0::float8 as category_weight,
      1.0::float8 as tag_weight,
      0.5::float8 as recency_weight,
      168.0::float8 as recency_half_life_hours
  ),
  my_topics as (
    -- Universo de "engajamento pessoal": salvei OU sou autor do
    -- tópico OU respondi nele. Nunca inclui tópico só porque apareceu
    -- em busca/Recentes sem ação real do profissional.
    select topic_id from public.community_saved_topics where profile_id = auth.uid()
    union
    select id as topic_id from public.community_topics where author_profile_id = auth.uid()
    union
    select topic_id from public.community_posts where author_profile_id = auth.uid()
  ),
  affinity_categories as (
    select t.category_id, count(*) as freq
    from my_topics mt
    join public.community_topics t on t.id = mt.topic_id
    group by t.category_id
  ),
  affinity_tags as (
    select tt.tag_id, count(*) as freq
    from my_topics mt
    join public.community_topic_tags tt on tt.topic_id = mt.topic_id
    group by tt.tag_id
  ),
  candidates as (
    select t.*
    from public.community_topics t
    where t.status = 'published'
      and t.id not in (select topic_id from my_topics)
      -- Cold start: sem NENHUM tópico de engajamento pessoal, sem
      -- candidato — every community_topics.category_id is not null,
      -- então my_topics vazio <=> affinity_categories vazio.
      and exists (select 1 from affinity_categories)
  ),
  scored as (
    select
      c.id,
      coalesce((select ac.freq from affinity_categories ac where ac.category_id = c.category_id), 0)::float8 as category_freq,
      coalesce((
        select sum(at.freq) from public.community_topic_tags tt
        join affinity_tags at on at.tag_id = tt.tag_id
        where tt.topic_id = c.id
      ), 0)::float8 as tag_freq
    from candidates c
  )
  select
    c.id, c.author_profile_id, c.title, c.body, c.category_id, c.audience, c.status,
    c.reply_count, c.participant_count, c.last_activity_at, c.created_at, c.updated_at,
    round((
      s.category_freq * params.category_weight
      + s.tag_freq * params.tag_weight
      + exp((-ln(2)) * (extract(epoch from (now() - c.last_activity_at)) / 3600.0) / params.recency_half_life_hours) * params.recency_weight
    )::numeric, 4) as for_you_score
  from candidates c
  join scored s on s.id = c.id
  cross join params
  where s.category_freq > 0 or s.tag_freq > 0
  order by for_you_score desc, c.last_activity_at desc, c.id asc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.get_community_for_you_topics(integer) is 'Ranking V1 de "Para você" — relevância pessoal (categoria/tag de afinidade a partir de salvos+participação REAL), nunca popularidade. Cold start devolve vazio de propósito.';

revoke all on function public.get_community_for_you_topics(integer) from public, anon;
grant execute on function public.get_community_for_you_topics(integer) to authenticated;
