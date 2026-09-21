-- Doopla — Comunidade: tags livres, sem taxonomia fechada disfarçada.
--
-- Decisão canônica da fundadora (16/09/2026, reverte a decisão original
-- documentada no comentário de `community_tags`, migration 0059):
-- "não tentamos prever todos os assuntos da Comunidade. Tags podem
-- existir, mas devem ser livres e criadas pelo próprio usuário." O
-- mesmo espírito de 0088 (busca universal > taxonomia fechada
-- obrigatória) aplicado agora ao vocabulário de tags, não só à
-- categoria.
--
-- Não-destrutivo: `community_tags`/`community_topic_tags` continuam
-- exatamente a mesma estrutura (id/slug/label/active + join topic<->tag)
-- — nenhuma linha apagada, nenhuma tabela recriada. As 10 tags do beta
-- inicial (migration 0059) continuam existindo e continuam válidas;
-- elas só deixam de ser a ÚNICA fonte possível de tag. `active`
-- continua existindo (nunca usado por nenhuma moderação real hoje —
-- auditoria confirmou 0 lugares que fazem UPDATE nessa coluna), tags
-- novas nascem `active = true`, mesma convenção das antigas.
--
-- `search_community_topics` (migration 0068) já faz full-text sobre
-- `community_tags.label` de qualquer tag ligada ao tópico (join
-- `community_topic_tags`/`community_tags`, sem filtrar por origem) —
-- uma tag livre nova participa da busca universal automaticamente,
-- nenhuma mudança necessária ali.

-- ============================================================
-- 1. community_slugify — normalização de texto -> slug, reaproveitando
--    exatamente o padrão já usado pelas 10 tags seed (minúsculo, sem
--    acento, espaços/pontuação viram hífen, sem hífen nas pontas).
--    IMMUTABLE (determinística, sem I/O) — pode indexar/comparar por
--    ela sem custo extra.
-- ============================================================
create or replace function public.community_slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(p_text, ''),
          'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
          'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

comment on function public.community_slugify is 'Normaliza um texto de tag pra slug comparável (minúsculo, sem acento, hífens) — mesmo padrão das 10 tags seed de 0059. Usado por create_community_topic pra achar/criar tag livre sem duplicar por variação de maiúscula/acento/espaço.';

-- ============================================================
-- 2. create_community_topic — ganha p_tag_labels (texto livre), ao
--    lado do p_tag_ids que já existia. Comportamento de p_tag_ids é
--    IDÊNTICO a antes (valida contra tag existente e ativa, nunca
--    cria) — só quem manda p_tag_labels ganha find-or-create.
--    Web/App passam a mandar só p_tag_labels (tag livre) na criação;
--    p_tag_ids fica disponível pra qualquer chamador futuro que
--    precise referenciar uma tag já conhecida por id direto.
--
-- ATENÇÃO (achado real durante o teste desta migration num Postgres
-- local, antes de aplicar em produção): `create or replace function`
-- só troca o CORPO quando a lista de tipos dos parâmetros é IDÊNTICA.
-- Um parâmetro novo no final muda a lista de tipos (5 -> 6 argumentos),
-- então `create or replace` aqui criaria uma SEGUNDA function
-- (overload), deixando a versão antiga de 5 argumentos viva ao lado
-- da nova — confirmado reproduzindo isso de verdade (erro real:
-- "function name ... is not unique" ao tentar comentar a function
-- depois). Duas overloads do mesmo nome, uma delas sem os grants
-- corretos (grants não migram pra uma function nova), é exatamente o
-- tipo de inconsistência que pode fazer uma chamada de RPC falhar de
-- forma difícil de diagnosticar no cliente. Por isso o `drop function`
-- explícito abaixo, ANTES do create — garante 1 única function
-- `create_community_topic` no banco, nunca duas.
drop function if exists public.create_community_topic(text, text, uuid, text, uuid[]);

create or replace function public.create_community_topic(
  p_title text,
  p_body text,
  p_category_id uuid,
  p_audience text default 'all',
  p_tag_ids uuid[] default '{}',
  p_tag_labels text[] default '{}'
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
  v_label text;
  v_slug text;
  v_tag_id uuid;
  v_resolved_tag_ids uuid[] := '{}';
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

  if p_category_id is not null and not exists (
    select 1 from public.community_categories where id = p_category_id and active
  ) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;

  -- Limite de 5 conta as DUAS origens somadas (ids + labels) — nunca
  -- dá pra contornar o limite mandando id numa e label na outra.
  v_tag_count := coalesce(array_length(p_tag_ids, 1), 0) + coalesce(array_length(p_tag_labels, 1), 0);
  if v_tag_count > 5 then
    raise exception 'too_many_tags' using errcode = 'P0001';
  end if;

  if coalesce(array_length(p_tag_ids, 1), 0) > 0 and exists (
    select 1 from unnest(p_tag_ids) as tid
    left join public.community_tags ct on ct.id = tid and ct.active
    where ct.id is null
  ) then
    raise exception 'invalid_tags' using errcode = 'P0001';
  end if;

  -- Tag livre: acha por slug (mesmo texto normalizado = mesma tag,
  -- nunca duplica por causa de maiúscula/acento/espaço) ou cria. Nunca
  -- um catálogo fechado — qualquer texto válido vira tag na hora.
  if coalesce(array_length(p_tag_labels, 1), 0) > 0 then
    foreach v_label in array p_tag_labels loop
      v_label := trim(v_label);
      if length(v_label) < 2 or length(v_label) > 40 then
        raise exception 'invalid_tag_label' using errcode = 'P0001';
      end if;

      v_slug := public.community_slugify(v_label);
      if v_slug = '' then
        raise exception 'invalid_tag_label' using errcode = 'P0001';
      end if;

      insert into public.community_tags (slug, label)
      values (v_slug, v_label)
      on conflict (slug) do nothing;

      select id into v_tag_id from public.community_tags where slug = v_slug;
      v_resolved_tag_ids := array_append(v_resolved_tag_ids, v_tag_id);
    end loop;
  end if;

  insert into public.community_topics (author_profile_id, title, body, category_id, audience)
  values (v_actor, v_title, v_body, p_category_id, p_audience)
  returning id into v_topic_id;

  if coalesce(array_length(p_tag_ids, 1), 0) > 0 or coalesce(array_length(v_resolved_tag_ids, 1), 0) > 0 then
    insert into public.community_topic_tags (topic_id, tag_id)
    select v_topic_id, tid from unnest(p_tag_ids || v_resolved_tag_ids) as tid
    on conflict do nothing;
  end if;

  return v_topic_id;
end;
$$;

comment on function public.create_community_topic(text, text, uuid, text, uuid[], text[]) is 'Fase 1 (06/09/2026); busca universal (16/09/2026, categoria opcional); tags livres (16/09/2026, QA real — p_tag_labels faz find-or-create por slug, sem catálogo fechado). Mesma autenticação/membership/limites de sempre.';

-- Grants EXPLÍCITOS pra essa assinatura nova — ver o comentário grande
-- acima: como esta é, na prática, uma function nova (tipos de
-- parâmetro diferentes da de 5 argumentos que o drop acima removeu),
-- ela nasce SEM nenhum grant de execução. Sem isso, `authenticated`
-- não conseguiria chamar a RPC nenhuma (erro de permissão, não um
-- "não foi possível criar o tópico" genérico, mas o mesmo tipo de
-- sintoma difícil de diagnosticar sem olhar o banco). Mesmo padrão
-- exato de 0059/0088.
revoke execute on function public.create_community_topic(text, text, uuid, text, uuid[], text[]) from public, anon;
grant execute on function public.create_community_topic(text, text, uuid, text, uuid[], text[]) to authenticated;
