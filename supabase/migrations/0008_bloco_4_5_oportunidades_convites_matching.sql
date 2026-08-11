-- Doopla — Bloco 4.5: Oportunidades, Convites e Matching Simples do Beta.
--
-- Três entidades novas, cada uma com sua própria tabela/status/histórico —
-- nunca reaproveitar estrutura entre elas, mesmo que a interface mostre
-- tudo como "aceitar ou recusar":
--   1. representation_requests    → booker pede pra representar artista novo
--   2. (invites, já existe)       → "já trabalho com este artista" (Bloco anterior)
--   3. opportunity_invitations    → artista convida booker pra 1 oportunidade
--   4. opportunity_interests      → "tenho interesse" no modo aberto
--
-- Duas camadas de status separadas: `opportunity_status` (jornada da
-- publicação até a escolha do booker) nunca se funde com `booking_status`
-- (andamento do trabalho depois de escolhido — já existe desde o Bloco 4).
--
-- Sem infraestrutura de escala (embeddings/ranking/ondas) — isso é
-- Matching V2 e fica só estruturado (colunas/tabelas), não implementado.
-- O que importa agora: registrar os eventos certos (quem recebeu, quem
-- abriu, quem se interessou, quem foi escolhido) pra o V2 poder ser
-- construído em cima de comportamento real, sem reconstruir o fluxo.
--
-- Ordem deste arquivo segue dependência, não a numeração das seções do
-- roteiro: tabelas que `opportunities` referencia (convites, interesses)
-- nascem antes das policies/enum novos de `opportunities`, senão a
-- policy que olha pra elas não consegue ser criada.

-- =====================================================================
-- 1. representation_request — booker pede pra representar artista novo
-- =====================================================================

create type public.representation_request_status as enum (
  'pendente', 'aceita', 'recusada', 'expirada'
);

-- Limite de pendentes simultâneas por booker, conforme confiança/histórico.
-- Cálculo de confiança (o que sobe de 5 pra 10/20) é decisão de produto
-- futura — por enquanto todo booker começa em 5 e o valor é ajustável
-- manualmente (curadoria admin), daí ser coluna e não constante fixa.
alter table public.booker_profiles
  add column representation_request_limit integer not null default 5
    check (representation_request_limit in (5, 10, 20));

create table public.representation_requests (
  id uuid primary key default gen_random_uuid(),
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  status public.representation_request_status not null default 'pendente',
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint representation_requests_different_parties check (booker_profile_id <> artist_profile_id)
);

comment on table public.representation_requests is 'Booker descobre um artista novo (ainda não trabalham juntos) e pede pra representar. Expira em 7 dias. Distinto de invites (relação que já existe fora da doopla) e de opportunity_invitations (convite pontual pra uma oportunidade).';

-- Só uma solicitação pendente por par booker/artista de cada vez.
create unique index representation_requests_one_pending_per_pair
  on public.representation_requests (booker_profile_id, artist_profile_id)
  where status = 'pendente';

create index representation_requests_artist_pending_idx
  on public.representation_requests (artist_profile_id)
  where status = 'pendente';

-- Sem job agendado no beta ainda: quem for listar solicitações pendentes
-- (Server Action) chama isso antes, pra virar 'expirada' o que já passou
-- dos 7 dias. Fica pronto pra virar um cron quando tivermos infra pra isso.
create function public.expire_stale_representation_requests()
returns void
language sql
security definer set search_path = public
as $$
  update public.representation_requests
  set status = 'expirada'
  where status = 'pendente' and expires_at <= now();
$$;

-- Limite de pendentes é reforçado no banco (não só na Server Action) pra
-- não depender de toda chamada de insert lembrar de checar. Conta como
-- "vencida" mesmo que o sweep acima ainda não tenha rodado.
create function public.enforce_representation_request_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit integer;
  v_pending_count integer;
begin
  if new.status <> 'pendente' then
    return new;
  end if;

  select representation_request_limit into v_limit
  from public.booker_profiles
  where profile_id = new.booker_profile_id;

  select count(*) into v_pending_count
  from public.representation_requests
  where booker_profile_id = new.booker_profile_id
    and status = 'pendente'
    and expires_at > now();

  if v_pending_count >= coalesce(v_limit, 5) then
    raise exception 'representation_request_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger representation_request_limit_check
  before insert on public.representation_requests
  for each row execute function public.enforce_representation_request_limit();

-- Aceitar faz nascer a relação artista-booker — igual ao que já acontece
-- pro convite "já trabalho com este artista" (Bloco anterior), só que
-- aqui via representation_requests em vez de invites. Fica garantido no
-- banco (trigger), não depende da Server Action lembrar de fazer os dois
-- passos, já que essa é a garantia de produto que mais importa aqui.
alter table public.representations
  add column created_via_representation_request_id uuid
    references public.representation_requests (id) on delete set null;

create function public.handle_representation_request_response()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'aceita' and old.status <> 'aceita' then
    insert into public.representations (
      artist_profile_id, booker_profile_id, created_via_representation_request_id
    ) values (
      new.artist_profile_id, new.booker_profile_id, new.id
    )
    on conflict (artist_profile_id, booker_profile_id) do nothing;
    new.responded_at := coalesce(new.responded_at, now());
  elsif new.status = 'recusada' and old.status <> 'recusada' then
    new.responded_at := coalesce(new.responded_at, now());
  end if;

  return new;
end;
$$;

create trigger representation_request_response
  before update on public.representation_requests
  for each row execute function public.handle_representation_request_response();

alter table public.representation_requests enable row level security;

create policy "representation_requests: select related" on public.representation_requests
  for select using (auth.uid() = booker_profile_id or auth.uid() = artist_profile_id);
create policy "representation_requests: insert own" on public.representation_requests
  for insert with check (auth.uid() = booker_profile_id);
create policy "representation_requests: artist responds" on public.representation_requests
  for update using (auth.uid() = artist_profile_id)
  with check (auth.uid() = artist_profile_id);

-- =====================================================================
-- 2. Curadoria administrativa (seção 4 do roteiro) — precisa existir
--    antes das policies de opportunity_events mais abaixo.
-- =====================================================================

alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'Curadoria administrativa do beta: admin pode direcionar oportunidades manualmente pra bookers específicos (registrado em opportunity_events, source = curadoria_admin).';

-- =====================================================================
-- 3. Tabelas base de opportunity_invitations / opportunity_interests /
--    opportunity_events — só a estrutura aqui. RLS e policies ficam pra
--    depois da seção 4 (evolução de `opportunities`), porque várias delas
--    olham pra `distribution_mode` e pros novos valores de `status`, que
--    só existem depois de a coluna/enum serem alterados.
-- =====================================================================

create type public.opportunity_invitation_status as enum (
  'pendente', 'aceita', 'recusada', 'encerrada'
);

comment on type public.opportunity_invitation_status is '''encerrada'' = OPPORTUNITY_FILLED: outro booker foi selecionado primeiro, fecha esse convite automaticamente.';

create table public.opportunity_invitations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.opportunity_invitation_status not null default 'pendente',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (opportunity_id, booker_profile_id)
);

comment on table public.opportunity_invitations is 'Artista convida um booker específico pra uma oportunidade pontual. Aceitar é só participação nessa oportunidade — nunca cria representação permanente (isso é representation_requests/invites).';

create type public.opportunity_interest_status as enum (
  'pendente', 'selecionado', 'encerrado'
);

create table public.opportunity_interests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.opportunity_interest_status not null default 'pendente',
  created_at timestamptz not null default now(),
  unique (opportunity_id, booker_profile_id)
);

comment on table public.opportunity_interests is '"Tenho interesse" no modo aberto — NÃO reserva a oportunidade nem bloqueia convite direto. Exclusividade só existe quando a oportunidade já tem selected_booker_id.';

create table public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  booker_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  source text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.opportunity_events is 'Histórico de eventos da oportunidade, sem uso na interface ainda — alimenta o Matching V2 (taxa de resposta, tempo de resposta etc.) sem precisar reconstruir o fluxo central.';
comment on column public.opportunity_events.event_type is 'recebida | aberta | interesse | convite_enviado | convite_aceito | selecionado | encerrada';
comment on column public.opportunity_events.source is 'regra_categoria | curadoria_admin | convite_direto | booker | sistema';

create index opportunity_events_opportunity_idx on public.opportunity_events (opportunity_id);

-- =====================================================================
-- 4. opportunities — evolui pra ter as duas camadas de status separadas
--    e os campos estruturados básicos do matching do beta.
-- =====================================================================

-- Policies antigas mexem em `status`; derrubamos antes de trocar o tipo
-- da coluna pra não depender de policy sobreviver a um ALTER COLUMN TYPE.
drop policy "opportunities: select open or own" on public.opportunities;
drop policy "opportunities: update by artist or claiming booker" on public.opportunities;

-- opportunity_status = jornada de publicação (nunca o andamento do
-- trabalho, isso é booking_status). DRAFT/OPEN/MATCHING/INTEREST_RECEIVED/
-- BOOKER_SELECTED do roteiro, nomeados em português como o resto do banco.
-- 'cancelada' continua existindo (artista desiste) — fora da sequência
-- linear, é estado terminal. 'preenchida' vira 'booker_selecionado'.
alter type public.opportunity_status rename to opportunity_status_old;

create type public.opportunity_status as enum (
  'rascunho',           -- DRAFT — reservado pra um fluxo de salvar rascunho ainda não construído
  'aberta',             -- OPEN
  'em_distribuicao',    -- MATCHING — sendo distribuída/considerada por bookers
  'interesse_recebido', -- INTEREST_RECEIVED
  'booker_selecionado', -- BOOKER_SELECTED — a partir daqui já existe um booking
  'cancelada'
);

alter table public.opportunities
  alter column status drop default,
  alter column status type public.opportunity_status using (
    case status::text
      when 'aberta' then 'aberta'
      when 'preenchida' then 'booker_selecionado'
      when 'cancelada' then 'cancelada'
    end
  )::public.opportunity_status,
  alter column status set default 'aberta';

drop type public.opportunity_status_old;

create type public.opportunity_distribution_mode as enum (
  'meus_bookers',  -- só convite direto (opportunity_invitations)
  'novos_bookers', -- só interesse aberto (opportunity_interests)
  'ambos'          -- os dois caminhos em paralelo até alguém ser selecionado
);

alter table public.opportunities
  add column distribution_mode public.opportunity_distribution_mode not null default 'ambos',
  add column work_type text,
  add column category text,
  add column location text,
  add column event_date date,
  add column cache_min_cents integer,
  add column cache_max_cents integer,
  add column selected_booker_id uuid references public.profiles (id) on delete set null,
  add column selected_at timestamptz,
  -- extração de tags por IA é assíncrona e nunca bloqueia a publicação
  -- (seção 5) — essas colunas só rastreiam o processamento em background.
  add column ai_tags_status text not null default 'pendente'
    check (ai_tags_status in ('pendente', 'concluido', 'falhou')),
  add column ai_tags_content_hash text,
  add column ai_tags_processed_at timestamptz;

comment on column public.opportunities.event_date is 'Data do evento ou prazo de resposta, conforme o tipo de oportunidade — o roteiro trata os dois como um campo só no beta.';
comment on column public.opportunities.ai_tags_content_hash is 'Hash do conteúdo relevante (descrição, tipo, categoria) — o worker de tags (V2) só reprocessa se isso mudar, pra não recalcular à toa.';

create index opportunities_status_idx on public.opportunities (status);
create index opportunities_category_idx on public.opportunities (category);

create policy "opportunities: select open, own or invited" on public.opportunities
  for select using (
    auth.uid() = artist_profile_id
    or (
      status in ('aberta', 'em_distribuicao', 'interesse_recebido')
      and distribution_mode in ('novos_bookers', 'ambos')
    )
    or exists (
      select 1 from public.opportunity_invitations oi
      where oi.opportunity_id = id and oi.booker_profile_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Só o artista dono mexe na oportunidade diretamente pelo cliente. Trocar
-- selected_booker_id é sempre via select_booker_for_opportunity() (abaixo),
-- nunca por update direto — é o que garante a atomicidade exigida no
-- roteiro (segundo aceite simultâneo tem que falhar, não pisar no primeiro).
create policy "opportunities: update own" on public.opportunities
  for update using (auth.uid() = artist_profile_id);

-- =====================================================================
-- 5. RLS e policies de opportunity_invitations / opportunity_interests
-- =====================================================================

alter table public.opportunity_invitations enable row level security;

create policy "opportunity_invitations: select related" on public.opportunity_invitations
  for select using (
    auth.uid() = booker_profile_id
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );
create policy "opportunity_invitations: insert by artist" on public.opportunity_invitations
  for insert with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );
-- Recusar é update direto; aceitar (virar o selected_booker_id da
-- oportunidade) só via select_booker_for_opportunity(), nunca por aqui.
create policy "opportunity_invitations: booker declines" on public.opportunity_invitations
  for update using (auth.uid() = booker_profile_id)
  with check (auth.uid() = booker_profile_id and status = 'recusada');

alter table public.opportunity_interests enable row level security;

create policy "opportunity_interests: select related" on public.opportunity_interests
  for select using (
    auth.uid() = booker_profile_id
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );
create policy "opportunity_interests: insert own" on public.opportunity_interests
  for insert with check (
    auth.uid() = booker_profile_id
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.distribution_mode in ('novos_bookers', 'ambos')
        and o.status in ('aberta', 'em_distribuicao', 'interesse_recebido')
    )
  );
create policy "opportunity_interests: withdraw own" on public.opportunity_interests
  for delete using (auth.uid() = booker_profile_id);

-- =====================================================================
-- 6. RLS, policies e triggers de opportunity_events — dados pro Matching
--    V2, registrados desde já (quem recebeu, quem abriu, quem se
--    interessou, quem foi escolhido).
-- =====================================================================

alter table public.opportunity_events enable row level security;

create policy "opportunity_events: select related" on public.opportunity_events
  for select using (
    auth.uid() = booker_profile_id
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- Curadoria admin registra 'recebida' manualmente; distribuição por regra
-- de categoria (sem interface própria ainda) fica pra Server Action futura
-- inserir com source = 'regra_categoria', também como admin/service role.
create policy "opportunity_events: insert by booker or admin" on public.opportunity_events
  for insert with check (
    auth.uid() = booker_profile_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Convite e interesse já nascem logados, sem depender da Server Action
-- lembrar de registrar — é a garantia de que os dados pro V2 existem
-- desde o beta mesmo que ninguém use o events diretamente ainda.
create function public.log_opportunity_invitation_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  values (new.opportunity_id, new.booker_profile_id, 'convite_enviado', 'convite_direto');
  return new;
end;
$$;

create trigger opportunity_invitation_created
  after insert on public.opportunity_invitations
  for each row execute function public.log_opportunity_invitation_event();

create function public.log_opportunity_interest_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  values (new.opportunity_id, new.booker_profile_id, 'interesse', 'booker');
  return new;
end;
$$;

create trigger opportunity_interest_created
  after insert on public.opportunity_interests
  for each row execute function public.log_opportunity_interest_event();

-- =====================================================================
-- 7. Seleção atômica do booker (seção 3 do roteiro — requisito crítico)
-- =====================================================================
--
-- Único caminho pra preencher selected_booker_id. O `for update` trava a
-- linha da oportunidade: duas chamadas concorrentes serializam nessa trava,
-- e a segunda encontra selected_booker_id já preenchido e falha — não tem
-- como duas pessoas "ganharem" a mesma oportunidade ao mesmo tempo.
--
-- Fecha automaticamente os outros caminhos: convites pendentes a outros
-- bookers viram 'encerrada', interesses pendentes viram 'encerrado' (o do
-- escolhido vira 'selecionado'), e tudo fica logado em opportunity_events.
create function public.select_booker_for_opportunity(
  p_opportunity_id uuid,
  p_booker_profile_id uuid
)
returns public.opportunities
language plpgsql
security definer set search_path = public
as $$
declare
  v_opportunity public.opportunities;
begin
  select * into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if v_opportunity is null then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  if auth.uid() <> v_opportunity.artist_profile_id and auth.uid() <> p_booker_profile_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_opportunity.selected_booker_id is not null then
    raise exception 'opportunity_already_filled' using errcode = 'P0001';
  end if;

  update public.opportunities
  set status = 'booker_selecionado',
      selected_booker_id = p_booker_profile_id,
      selected_at = now()
  where id = p_opportunity_id
  returning * into v_opportunity;

  update public.opportunity_invitations
  set status = 'aceita', responded_at = now()
  where opportunity_id = p_opportunity_id
    and booker_profile_id = p_booker_profile_id
    and status = 'pendente';

  with closed as (
    update public.opportunity_invitations
    set status = 'encerrada', responded_at = now()
    where opportunity_id = p_opportunity_id
      and booker_profile_id <> p_booker_profile_id
      and status = 'pendente'
    returning booker_profile_id
  )
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  select p_opportunity_id, booker_profile_id, 'encerrada', 'sistema' from closed;

  update public.opportunity_interests
  set status = 'selecionado'
  where opportunity_id = p_opportunity_id
    and booker_profile_id = p_booker_profile_id
    and status = 'pendente';

  with closed as (
    update public.opportunity_interests
    set status = 'encerrado'
    where opportunity_id = p_opportunity_id
      and booker_profile_id <> p_booker_profile_id
      and status = 'pendente'
    returning booker_profile_id
  )
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  select p_opportunity_id, booker_profile_id, 'encerrada', 'sistema' from closed;

  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  values (p_opportunity_id, p_booker_profile_id, 'selecionado', 'artista');

  return v_opportunity;
end;
$$;

comment on function public.select_booker_for_opportunity is 'Único caminho pra preencher opportunities.selected_booker_id. Levanta opportunity_already_filled (P0001) se outro booker já foi selecionado — é a Server Action que traduz isso pro aviso "Esta oportunidade foi encerrada. O artista seguiu com outro booker."';

-- =====================================================================
-- 8. Tags do beta (seção 5) — explicit + ai, sem ranking sofisticado.
--    performance fica pra V2 (depende de comportamento real, que já
--    está sendo capturado acima via opportunity_events).
-- =====================================================================

create type public.opportunity_tag_source as enum ('explicit', 'ai');

create table public.opportunity_tags (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  tag text not null,
  source public.opportunity_tag_source not null,
  created_at timestamptz not null default now(),
  unique (opportunity_id, tag, source)
);

comment on table public.opportunity_tags is 'explicit = declarado pelo usuário/campo estruturado; ai = inferido pelo texto em background, depois da publicação (nunca bloqueia). Busca semântica com pgvector fica estruturável, mas não é requisito do beta.';

create index opportunity_tags_tag_idx on public.opportunity_tags (tag);

alter table public.opportunity_tags enable row level security;

create policy "opportunity_tags: select open or own" on public.opportunity_tags
  for select using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (
          auth.uid() = o.artist_profile_id
          or o.status in ('aberta', 'em_distribuicao', 'interesse_recebido')
        )
    )
  );
create policy "opportunity_tags: insert by artist" on public.opportunity_tags
  for insert with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );

-- =====================================================================
-- 9. Custo de IA (seção 6) — medir desde o início, sem otimizar ainda.
-- =====================================================================

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  feature text not null,
  input_tokens integer,
  output_tokens integer,
  cost_cents_estimate integer,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage_events is 'Log de uso de IA por usuário/oportunidade, pra medir custo desde o beta.';
comment on column public.ai_usage_events.feature is 'tags_extraction | contrato | proposta | comunicacao | outros';

create index ai_usage_events_profile_idx on public.ai_usage_events (profile_id);

alter table public.ai_usage_events enable row level security;

-- Sem policy de insert: só a Server Action (service role) grava, nunca o
-- cliente autenticado direto — mesmo padrão de "não precisa de toda
-- policy" já usado nos triggers de public.profiles (Bloco 1).
create policy "ai_usage_events: select own" on public.ai_usage_events
  for select using (auth.uid() = profile_id);
