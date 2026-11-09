-- Doopla — Comunidade V1 (núcleo): tópicos, respostas, menções,
-- salvos, notificações e o perfil de participação na Comunidade.
--
-- Princípio central (decidido explicitamente antes desta migration):
-- ZERO duplicação de dado canônico. Nome profissional, profissão,
-- cidade, avatar, bio, especialidades/gêneros, tipos de trabalho,
-- Instagram, portfólio e plano continuam vivendo só em
-- profiles/artist_profiles/subscriptions — a Comunidade nunca copia
-- nem sincroniza nada disso. community_profiles guarda somente:
-- opt-in, estado de moderação, disponibilidade pra indicações e as
-- preferências de visibilidade (o que o profissional autorizou expor
-- pra outros membros). A leitura pública (community_profiles_public,
-- no fim deste arquivo) aplica essas preferências e devolve NULL pra
-- qualquer campo não autorizado — o client nunca recebe o dado privado
-- pra depois escondê-lo.
--
-- Escopo V1: só profile_id com role = 'artista' (profissional
-- representado). Booker/agência não têm identidade própria na
-- Comunidade nesta fase — decisão registrada, não um esquecimento.
--
-- Fora desta migration (fica pra depois, blocos separados já
-- combinados): moderação/denúncias (reaproveita profiles.is_admin,
-- que já existe e já tem proteção contra auto-promoção desde a
-- migration 0019 — nada de tabela nova de "moderadores"), busca/
-- filtros combinados (tsvector) e analytics.

-- =====================================================================
-- 1. Taxonomia — categorias de TÓPICO (não confundir com profession:
-- professions/profession_job_types, migration 0037, já existe e
-- continua sendo a fonte de profissão/nicho, reaproveitada via join
-- na view no fim deste arquivo). Configurável por dado, nunca
-- hardcoded em componente.
-- =====================================================================

create table public.community_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

comment on table public.community_categories is 'Categorias de tópico da Comunidade (Clientes, Cachê & negociação, etc.) — evolutivo via dado, nunca lista fixa no componente.';

create table public.community_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  active boolean not null default true
);

comment on table public.community_tags is 'Vocabulário controlado de tags do beta — sem criação livre de tag pelo usuário (decisão da spec).';

-- =====================================================================
-- 2. community_profiles — participação/opt-in na Comunidade.
--
-- visibility_status é domínio EXCLUSIVO de moderação. Nenhuma RPC
-- exposta nesta migration aceita esse campo como parâmetro (só é
-- setado 'active' na ativação) — e o trigger abaixo bloqueia qualquer
-- tentativa de alteração vinda de uma sessão de usuário autenticada,
-- mesmo que uma RPC futura erre e tente. Mesmo padrão de
-- prevent_self_admin_promotion() (migration 0019) aplicado aqui.
--
-- Campos opcionais nascem 'false' (privacy by default de verdade — o
-- valor só vira true depois de update_community_profile() ser chamada
-- explicitamente, nunca por padrão de coluna).
-- =====================================================================

create table public.community_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  visibility_status text not null default 'active'
    check (visibility_status in ('active', 'restricted', 'blocked')),
  available_for_referrals boolean not null default false,
  show_city boolean not null default false,
  show_avatar boolean not null default false,
  show_bio boolean not null default false,
  show_specialties boolean not null default false,
  show_work_types boolean not null default false,
  show_instagram boolean not null default false,
  show_portfolio boolean not null default false,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.community_profiles is 'Opt-in + preferências de visibilidade da Comunidade. NUNCA duplica nome/cidade/bio/avatar/instagram/portfolio/especialidades/plano — isso é lido ao vivo de profiles/artist_profiles/subscriptions (ver community_profiles_public).';
comment on column public.community_profiles.visibility_status is 'Domínio exclusivo de moderação (0060). O próprio profissional nunca altera isso — ver trigger prevent_self_community_moderation_change.';
comment on column public.community_profiles.available_for_referrals is 'Sinal profissional "disponível para indicações" — específico da Comunidade, não existe em artist_profiles.';

create or replace function public.prevent_self_community_moderation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bloqueia só quando a sessão autenticada está mudando a PRÓPRIA
  -- linha (new.profile_id = auth.uid()) — nunca a "profissional
  -- tentando se restaurar/promover". Uma RPC de moderação futura
  -- (0060), rodando como o moderador (auth.uid() = moderador,
  -- profile_id = alvo diferente), continua funcionando normalmente:
  -- não é a mesma pessoa mudando a própria linha.
  if auth.uid() is not null
     and new.profile_id = auth.uid()
     and new.visibility_status is distinct from old.visibility_status then
    new.visibility_status := old.visibility_status;
  end if;
  return new;
end;
$$;

create trigger community_profiles_prevent_self_moderation_change
  before update on public.community_profiles
  for each row execute function public.prevent_self_community_moderation_change();

create trigger community_profiles_set_updated_at
  before update on public.community_profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. community_topics / community_posts — timeline simples (sem
-- árvore de subthreads, decisão da spec). Soft delete sempre: status
-- muda, a linha nunca é apagada, pra nunca quebrar reply_to_post_id de
-- terceiros nem o contexto de outras respostas.
-- =====================================================================

create table public.community_topics (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid not null references public.profiles (id),
  title text not null,
  body text not null,
  category_id uuid not null references public.community_categories (id),
  audience text not null default 'all' check (audience in ('niche', 'all')),
  status text not null default 'published'
    check (status in ('published', 'removed_by_author', 'removed_by_moderator')),
  reply_count integer not null default 0,
  participant_count integer not null default 1,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.community_topics is 'audience=niche significa "direcionado ao nicho do autor" — o nicho é sempre o category atual do autor (join em artist_profiles), nunca um snapshot: evita mais uma cópia de dado que pode ficar desatualizada.';
comment on column public.community_topics.reply_count is 'Conta TODAS as respostas já criadas, inclusive removidas depois — é sinal de atividade, não de conteúdo visível no momento.';

create index community_topics_category_id_idx on public.community_topics (category_id);
create index community_topics_author_profile_id_idx on public.community_topics (author_profile_id);
create index community_topics_last_activity_at_idx on public.community_topics (last_activity_at desc);

create trigger community_topics_set_updated_at
  before update on public.community_topics
  for each row execute function public.set_updated_at();

create table public.community_topic_tags (
  topic_id uuid not null references public.community_topics (id) on delete cascade,
  tag_id uuid not null references public.community_tags (id),
  primary key (topic_id, tag_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.community_topics (id),
  author_profile_id uuid not null references public.profiles (id),
  body text not null,
  reply_to_post_id uuid references public.community_posts (id),
  status text not null default 'published'
    check (status in ('published', 'removed_by_author', 'removed_by_moderator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.community_posts.reply_to_post_id is 'Referência estruturada à mensagem respondida (não cópia de texto). Continua válida mesmo se a mensagem referenciada for removida depois — a UI mostra "Mensagem removida" preservando a referência.';

create index community_posts_topic_id_idx on public.community_posts (topic_id);
create index community_posts_author_profile_id_idx on public.community_posts (author_profile_id);
create index community_posts_reply_to_post_id_idx on public.community_posts (reply_to_post_id);

create trigger community_posts_set_updated_at
  before update on public.community_posts
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4. community_mentions — estruturada (post -> profile), nunca
-- dependente de parsing de texto "@nome".
-- =====================================================================

create table public.community_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  mentioned_profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (post_id, mentioned_profile_id)
);

create index community_mentions_mentioned_profile_id_idx on public.community_mentions (mentioned_profile_id);

-- =====================================================================
-- 5. community_saved_topics — privado, sem notificar o autor. Único
-- caso desta migration com RLS de escrita direta (sem RPC): é um
-- toggle puro, sem contador nem efeito colateral.
-- =====================================================================

create table public.community_saved_topics (
  profile_id uuid not null references public.profiles (id),
  topic_id uuid not null references public.community_topics (id),
  created_at timestamptz not null default now(),
  primary key (profile_id, topic_id)
);

-- =====================================================================
-- 6. community_notifications — não existia nenhum sistema de
-- notificação reaproveitável no produto (confirmado antes desta
-- migration). Shape genérico o suficiente (recipient/actor/type/
-- read_at + referência ao tópico/post) pra não travar um Notification
-- Center unificado futuro, mas escopado só à Comunidade por agora —
-- sem inventar infraestrutura maior do que o V1 precisa.
-- =====================================================================

create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id),
  actor_profile_id uuid not null references public.profiles (id),
  type text not null check (type in ('reply_to_topic', 'reply_to_post', 'mention')),
  topic_id uuid not null references public.community_topics (id),
  post_id uuid references public.community_posts (id),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index community_notifications_recipient_unread_idx
  on public.community_notifications (recipient_profile_id, read_at);

-- =====================================================================
-- 7. RLS — select liberado a authenticated (conteúdo é compartilhado
-- por natureza, diferente do resto do produto que isola por dono);
-- ESCRITA SEMPRE VIA RPC security definer, nunca policy de insert/
-- update direta (mesmo idioma do Approval Engine/Runtime/Policy Gate).
-- Única exceção: community_saved_topics (ver seção 5 acima).
-- =====================================================================

alter table public.community_categories enable row level security;
alter table public.community_tags enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_topics enable row level security;
alter table public.community_topic_tags enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_mentions enable row level security;
alter table public.community_saved_topics enable row level security;
alter table public.community_notifications enable row level security;

-- Toda policy abaixo é "to authenticated" explícito — a Comunidade é
-- espaço exclusivo de usuários autenticados (spec, seção 1/2). Sem
-- isso, condições como "true" ou "status = 'published'" não dependem
-- de auth.uid() e ficariam de fato abertas pra anon (o grant de
-- tabela padrão do Supabase já cobre anon; quem fecha a porta é a
-- policy restrita ao role certo).

create policy "community_categories: select all" on public.community_categories
  for select to authenticated using (true);

create policy "community_tags: select all" on public.community_tags
  for select to authenticated using (true);

create policy "community_profiles: select own" on public.community_profiles
  for select to authenticated using (auth.uid() = profile_id);

create policy "community_topics: select visible" on public.community_topics
  for select to authenticated using (status = 'published' or author_profile_id = auth.uid());

create policy "community_topic_tags: select visible" on public.community_topic_tags
  for select to authenticated using (
    exists (
      select 1 from public.community_topics t
      where t.id = topic_id and (t.status = 'published' or t.author_profile_id = auth.uid())
    )
  );

create policy "community_posts: select visible" on public.community_posts
  for select to authenticated using (status = 'published' or author_profile_id = auth.uid());

create policy "community_mentions: select relevant" on public.community_mentions
  for select to authenticated using (
    mentioned_profile_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_id and (p.status = 'published' or p.author_profile_id = auth.uid())
    )
  );

create policy "community_saved_topics: select own" on public.community_saved_topics
  for select to authenticated using (profile_id = auth.uid());
create policy "community_saved_topics: insert own" on public.community_saved_topics
  for insert to authenticated with check (profile_id = auth.uid());
create policy "community_saved_topics: delete own" on public.community_saved_topics
  for delete to authenticated using (profile_id = auth.uid());

create policy "community_notifications: select own" on public.community_notifications
  for select to authenticated using (recipient_profile_id = auth.uid());

-- =====================================================================
-- 8. community_profiles_public — a camada que aplica a privacidade.
-- security definer por ownership de view (mesmo mecanismo usado pelas
-- functions security definer do resto do projeto): a view enxerga
-- profiles/artist_profiles/subscriptions de QUALQUER profissional
-- (não só o próprio), mas só devolve os campos opcionais quando a
-- preferência correspondente está true — nunca o client decidindo
-- esconder depois. blocked/restricted nunca perdem nome+profissão
-- (identidade mínima, pra não deixar tópico/resposta antigos com
-- autor "fantasma"), mas perdem todo o resto e available_for_referrals.
-- =====================================================================

create view public.community_profiles_public as
select
  cp.profile_id,
  coalesce(ap.stage_name, p.full_name) as display_name,
  coalesce(prof.label, ap.category) as profession_label,
  ap.category as profession_id,
  coalesce(s.artist_plan = 'pro' and s.status = 'active', false) as is_pro,
  (cp.visibility_status = 'active' and cp.available_for_referrals) as available_for_referrals,
  (ap.stage_name is null or ap.category is null) as is_incomplete,
  case when cp.visibility_status = 'active' and cp.show_city then p.city end as city,
  case when cp.visibility_status = 'active' and cp.show_city then p.state end as state,
  case when cp.visibility_status = 'active' and cp.show_avatar then p.avatar_url end as avatar_url,
  case when cp.visibility_status = 'active' and cp.show_bio then ap.bio end as bio,
  case when cp.visibility_status = 'active' and cp.show_specialties then ap.genres end as specialties,
  case when cp.visibility_status = 'active' and cp.show_work_types then ap.work_types end as work_types,
  case when cp.visibility_status = 'active' and cp.show_instagram then ap.instagram_url end as instagram_url,
  case when cp.visibility_status = 'active' and cp.show_portfolio then ap.portfolio_url end as portfolio_url
from public.community_profiles cp
join public.profiles p on p.id = cp.profile_id
left join public.artist_profiles ap on ap.profile_id = cp.profile_id
left join public.professions prof on prof.id = ap.category
left join public.subscriptions s on s.profile_id = cp.profile_id;

comment on view public.community_profiles_public is 'Única forma segura de ler dado de OUTRO profissional na Comunidade. visibility_status nunca é exposto na projeção (moderação é assunto interno) — só usado internamente pra decidir o que redigir.';

revoke all on public.community_profiles_public from public, anon;
grant select on public.community_profiles_public to authenticated;

-- =====================================================================
-- 9. RPCs de escrita — toda mutação passa por aqui. auth.uid() é
-- sempre a fonte de identidade, nunca um parâmetro vindo do client.
-- =====================================================================

create function public.activate_community_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_actor and role = 'artista') then
    raise exception 'community_requires_artist_role' using errcode = 'P0001';
  end if;

  insert into public.community_profiles (profile_id)
  values (v_actor)
  on conflict (profile_id) do nothing;
end;
$$;

comment on function public.activate_community_profile() is 'Idempotente — "Entrar na comunidade". Não grava nenhuma preferência de visibilidade (todas nascem false); update_community_profile() é uma chamada separada e explícita.';

create function public.update_community_profile(
  p_available_for_referrals boolean,
  p_show_city boolean,
  p_show_avatar boolean,
  p_show_bio boolean,
  p_show_specialties boolean,
  p_show_work_types boolean,
  p_show_instagram boolean,
  p_show_portfolio boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  update public.community_profiles
    set available_for_referrals = p_available_for_referrals,
        show_city = p_show_city,
        show_avatar = p_show_avatar,
        show_bio = p_show_bio,
        show_specialties = p_show_specialties,
        show_work_types = p_show_work_types,
        show_instagram = p_show_instagram,
        show_portfolio = p_show_portfolio
    where profile_id = v_actor;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'community_membership_required' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.update_community_profile is 'Nunca aceita visibility_status como parâmetro — moderação é inatingível por aqui, mesmo por engano. "Escolher o que aparece na Comunidade" da UI chama só esta função.';

create function public.create_community_topic(
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

  if not exists (select 1 from public.community_categories where id = p_category_id and active) then
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

create function public.remove_community_topic(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  update public.community_topics
    set status = 'removed_by_author'
    where id = p_topic_id and author_profile_id = v_actor and status = 'published';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'topic_not_removable' using errcode = 'P0001';
  end if;
end;
$$;

create function public.create_community_post(
  p_topic_id uuid,
  p_body text,
  p_reply_to_post_id uuid default null,
  p_mentioned_profile_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_body text := trim(p_body);
  v_topic public.community_topics%rowtype;
  v_reply_target public.community_posts%rowtype;
  v_post_id uuid;
  v_notified uuid[] := '{}';
  v_mentioned_id uuid;
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

  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception 'invalid_body' using errcode = 'P0001';
  end if;

  select * into v_topic from public.community_topics where id = p_topic_id and status = 'published';
  if not found then
    raise exception 'topic_not_available' using errcode = 'P0001';
  end if;

  if p_reply_to_post_id is not null then
    select * into v_reply_target from public.community_posts
      where id = p_reply_to_post_id and topic_id = p_topic_id;
    if not found then
      raise exception 'invalid_reply_target' using errcode = 'P0001';
    end if;
  end if;

  insert into public.community_posts (topic_id, author_profile_id, body, reply_to_post_id)
  values (p_topic_id, v_actor, v_body, p_reply_to_post_id)
  returning id into v_post_id;

  -- Menções: ids resolvidos pelo client (autocomplete), nunca parsing
  -- de "@nome". Alvo precisa ser membro ativo; alvo inválido é
  -- ignorado (não derruba o post inteiro). Sem auto-menção, sem
  -- duplicata, teto de 10.
  if p_mentioned_profile_ids is not null and array_length(p_mentioned_profile_ids, 1) > 0 then
    for v_mentioned_id in
      select distinct m from unnest(p_mentioned_profile_ids[1:10]) as m
    loop
      if v_mentioned_id is null or v_mentioned_id = v_actor then
        continue;
      end if;

      if not exists (
        select 1 from public.community_profiles
        where profile_id = v_mentioned_id and visibility_status = 'active'
      ) then
        continue;
      end if;

      insert into public.community_mentions (post_id, mentioned_profile_id)
      values (v_post_id, v_mentioned_id)
      on conflict do nothing;

      if not (v_mentioned_id = any (v_notified)) then
        insert into public.community_notifications (recipient_profile_id, actor_profile_id, type, topic_id, post_id)
        values (v_mentioned_id, v_actor, 'mention', p_topic_id, v_post_id);
        v_notified := v_notified || v_mentioned_id;
      end if;
    end loop;
  end if;

  -- Resposta a uma mensagem específica: notifica o autor dela, se
  -- diferente de quem respondeu e ainda não notificado por menção.
  if v_reply_target.author_profile_id is not null
     and v_reply_target.author_profile_id <> v_actor
     and not (v_reply_target.author_profile_id = any (v_notified)) then
    insert into public.community_notifications (recipient_profile_id, actor_profile_id, type, topic_id, post_id)
    values (v_reply_target.author_profile_id, v_actor, 'reply_to_post', p_topic_id, v_post_id);
    v_notified := v_notified || v_reply_target.author_profile_id;
  end if;

  -- Resposta ao tópico: notifica o autor do tópico, se diferente de
  -- quem respondeu e ainda não notificado acima. Nunca duplica
  -- notificação pra mesma pessoa pela mesma ação.
  if v_topic.author_profile_id <> v_actor
     and not (v_topic.author_profile_id = any (v_notified)) then
    insert into public.community_notifications (recipient_profile_id, actor_profile_id, type, topic_id, post_id)
    values (v_topic.author_profile_id, v_actor, 'reply_to_topic', p_topic_id, v_post_id);
  end if;

  update public.community_topics
    set reply_count = reply_count + 1,
        participant_count = (
          select count(distinct author_profile_id) from (
            select author_profile_id from public.community_posts where topic_id = p_topic_id
            union
            select author_profile_id from public.community_topics where id = p_topic_id
          ) participants
        ),
        last_activity_at = now()
    where id = p_topic_id;

  return v_post_id;
end;
$$;

create function public.remove_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  update public.community_posts
    set status = 'removed_by_author'
    where id = p_post_id and author_profile_id = v_actor and status = 'published';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'post_not_removable' using errcode = 'P0001';
  end if;
end;
$$;

create function public.mark_community_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  update public.community_notifications
    set read_at = now()
    where id = p_notification_id and recipient_profile_id = v_actor and read_at is null;
end;
$$;

-- Achado real ao testar: este projeto Supabase tem default privileges
-- que concedem EXECUTE a anon/authenticated/service_role em toda
-- function nova do schema public (pg_default_acl, defaclobjtype='f')
-- — "revoke ... from public" sozinho NÃO tira esse grant explícito de
-- anon (public e anon são coisas diferentes pra ACL de function).
-- Mesmo idioma da migration 0051: revoke de public E de anon,
-- explicitamente, nunca confiar em default.
revoke execute on function public.activate_community_profile() from public, anon;
revoke execute on function public.update_community_profile(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function public.create_community_topic(text, text, uuid, text, uuid[]) from public, anon;
revoke execute on function public.remove_community_topic(uuid) from public, anon;
revoke execute on function public.create_community_post(uuid, text, uuid, uuid[]) from public, anon;
revoke execute on function public.remove_community_post(uuid) from public, anon;
revoke execute on function public.mark_community_notification_read(uuid) from public, anon;

grant execute on function public.activate_community_profile() to authenticated;
grant execute on function public.update_community_profile(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.create_community_topic(text, text, uuid, text, uuid[]) to authenticated;
grant execute on function public.remove_community_topic(uuid) to authenticated;
grant execute on function public.create_community_post(uuid, text, uuid, uuid[]) to authenticated;
grant execute on function public.remove_community_post(uuid) to authenticated;
grant execute on function public.mark_community_notification_read(uuid) to authenticated;

-- =====================================================================
-- 10. Seed — categorias da spec (8) + vocabulário inicial de tags
-- (modesto, editável depois via dado, nunca via migration nova pra
-- cada tag).
-- =====================================================================

insert into public.community_categories (slug, label, sort_order) values
  ('clientes', 'Clientes', 1),
  ('cache-negociacao', 'Cachê & negociação', 2),
  ('contratos', 'Contratos', 3),
  ('carreira', 'Carreira', 4),
  ('marketing', 'Marketing', 5),
  ('equipamentos', 'Equipamentos', 6),
  ('indicacoes', 'Indicações', 7),
  ('geral', 'Geral', 8);

insert into public.community_tags (slug, label) values
  ('casamentos', 'Casamentos'),
  ('eventos-corporativos', 'Eventos corporativos'),
  ('freelancer', 'Freelancer'),
  ('mei', 'MEI'),
  ('nota-fiscal', 'Nota fiscal'),
  ('redes-sociais', 'Redes sociais'),
  ('precificacao-por-hora', 'Precificação por hora'),
  ('cliente-dificil', 'Cliente difícil'),
  ('primeira-contratacao', 'Primeira contratação'),
  ('equipamento-backup', 'Equipamento de backup');
