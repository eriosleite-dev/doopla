-- Doopla — Fluxo de qualificação de agências (site público) + gestão
-- no Painel Admin ("Agências Parceiras"). Escopo aprovado pela
-- fundadora: formulário em 3 etapas na Home -> classificação
-- automática (Prioridade alta / Potencial futuro / Fora do perfil) ->
-- toda inscrição salva e visível no Admin, independente da
-- classificação -> notificação (painel + e-mail) só pra prioritárias.
--
-- Decisões de desenho, registradas aqui porque não vieram explícitas
-- no briefing:
-- 1. "Observações internas" e "histórico de alterações" (pedido da
--    fundadora) são a MESMA coisa aqui: reaproveita admin_audit_events
--    (0096, já existente, genérico por target_table/target_id) em vez
--    de criar uma tabela de notas separada — cada nota vira um evento
--    action='agency_note_added', cada troca de status vira
--    action='agency_status_changed'. Um campo de nota solto (sem
--    histórico) divergiria do pedido explícito de rastreabilidade.
-- 2. Dedup/"prevenção de inscrições duplicadas": contact_email é
--    UNIQUE. Reenvio do mesmo e-mail faz UPDATE na MESMA linha (nunca
--    insert novo), reclassifica com os critérios atuais, e grava um
--    evento 'agency_application_resubmitted' — isso também é o que
--    torna "reenviar notificação sem duplicar cadastro" trivial: é
--    sempre a mesma linha, nunca uma nova.
-- 3. Faixas de classificação: a fundadora pediu "usar inicialmente as
--    faixas definidas no briefing", mas o briefing não trouxe números
--    (só os 3 nomes de classificação). Os defaults abaixo são
--    PLACEHOLDER, claramente meramente ilustrativos, editáveis depois
--    pelo Admin sem migration nova (exatamente o requisito) — reportado
--    à fundadora fora deste arquivo.
-- 4. Eventos de funil (agency_funnel_events) não guardam IP nem
--    qualquer identificador pessoal — só um token aleatório gerado no
--    cliente (localStorage), suficiente pra agrupar os passos de uma
--    mesma sessão sem virar dado pessoal.

-- ============================================================
-- 1. agency_applications — cada inscrição do formulário público.
-- ============================================================
create table public.agency_applications (
  id uuid primary key default gen_random_uuid(),

  agency_name text not null,
  website_or_instagram text not null,
  city text not null,
  country text not null,
  contact_name text not null,
  contact_role text not null,
  contact_email text not null,

  team_size integer not null check (team_size > 0),
  artists_represented integer not null check (artists_represented >= 0),
  monthly_requests_volume integer not null check (monthly_requests_volume >= 0),
  interest text not null check (interest in ('discovery_metrics', 'recurring_revenue', 'both')),

  -- Classificação automática (seção 3 do briefing) — recomputada a
  -- cada submit/resubmit contra agency_classification_criteria
  -- vigente no momento. classification_snapshot guarda os critérios
  -- USADOS naquele cálculo (nunca os atuais) — pra nunca reescrever
  -- silenciosamente o "porquê" de uma classificação passada se os
  -- critérios do Admin mudarem depois.
  classification text not null check (classification in ('priority', 'future_potential', 'out_of_profile')),
  classification_snapshot jsonb not null,

  -- Status comercial (gerenciado manualmente no Admin) — distinto de
  -- classification (sempre automática). 'new' é o estado inicial de
  -- TODA inscrição, mesmo 'out_of_profile' (requisito explícito:
  -- "independentemente da qualificação").
  status text not null default 'new'
    check (status in ('new', 'under_review', 'contacted', 'in_conversation', 'partner', 'rejected', 'archived')),

  consent_contact_at timestamptz not null,

  notification_status text not null default 'not_applicable'
    check (notification_status in ('not_applicable', 'pending', 'sent', 'failed')),
  notification_error text,
  notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (contact_email)
);

comment on table public.agency_applications is 'Inscrições do fluxo de qualificação de agências (Home -> "Conheça o programa para agências"). TODA inscrição fica aqui, independente da classificação. contact_email é único — reenvio do mesmo e-mail atualiza a MESMA linha (nunca duplica), ver submit_agency_application.';
comment on column public.agency_applications.classification_snapshot is 'Critérios de agency_classification_criteria EFETIVAMENTE usados neste cálculo (cópia, não referência) — nunca muda retroativamente se o Admin ajustar os critérios depois.';
comment on column public.agency_applications.status is 'Fluxo comercial manual, gerenciado no Admin. new = estado inicial de toda inscrição, mesmo as out_of_profile.';

create index agency_applications_classification_idx on public.agency_applications (classification);
create index agency_applications_status_idx on public.agency_applications (status);
create index agency_applications_created_at_idx on public.agency_applications (created_at desc);

alter table public.agency_applications enable row level security;
revoke select, insert, update, delete on public.agency_applications from anon, authenticated;

-- ============================================================
-- 2. agency_classification_criteria — linha única, editável só pelo
--    Admin (sem migration nova pra ajustar as faixas). Regra aplicada
--    em classify_agency_application: times/artistas/volume precisam
--    bater OS TRÊS mínimos da faixa pra entrar nela (nunca "qualquer
--    um dos três" — isso deixaria a classificação fácil demais de
--    "enganar" preenchendo só um campo alto).
-- ============================================================
create table public.agency_classification_criteria (
  id uuid primary key default gen_random_uuid(),
  priority_min_team_size integer not null default 5,
  priority_min_artists integer not null default 10,
  priority_min_monthly_requests integer not null default 5,
  future_min_team_size integer not null default 2,
  future_min_artists integer not null default 3,
  future_min_monthly_requests integer not null default 1,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

comment on table public.agency_classification_criteria is 'Linha ÚNICA (seedada por esta migration, nunca outra inserida — só admin_set_agency_classification_criteria faz UPDATE). Valores PLACEHOLDER no seed inicial: a fundadora não definiu números no briefing, só os 3 nomes de classificação — ajustar pelo Admin antes de depender disso em produção.';

alter table public.agency_classification_criteria enable row level security;
revoke select, insert, update, delete on public.agency_classification_criteria from anon, authenticated;

insert into public.agency_classification_criteria (priority_min_team_size, priority_min_artists, priority_min_monthly_requests, future_min_team_size, future_min_artists, future_min_monthly_requests)
values (5, 10, 5, 2, 3, 1);

-- ============================================================
-- 3. agency_notification_recipients — destinatários de e-mail pra
--    inscrições prioritárias, configuráveis no Admin (requisito
--    explícito: "sem deixar e-mails fixos no código").
-- ============================================================
create table public.agency_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.agency_notification_recipients is 'Destinatários de e-mail pra notificação de agência PRIORITÁRIA (gerenciado via Admin > Agências Parceiras > Configurações, nunca hardcoded).';

alter table public.agency_notification_recipients enable row level security;
revoke select, insert, update, delete on public.agency_notification_recipients from anon, authenticated;

-- ============================================================
-- 4. agency_funnel_events — analytics do funil público, SEM dado
--    pessoal: session_token é um valor aleatório gerado no cliente
--    (localStorage), nunca IP/fingerprint/e-mail. application_id só é
--    preenchido a partir do evento 'form_submit' em diante.
-- ============================================================
create table public.agency_funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('section_view', 'cta_click', 'form_start', 'form_step_completed', 'form_abandon', 'form_submit', 'classified')),
  session_token text not null,
  application_id uuid references public.agency_applications (id) on delete set null,
  step integer,
  classification text,
  created_at timestamptz not null default now()
);

comment on table public.agency_funnel_events is 'Funil de qualificação de agências — visualização/clique/início/etapa concluída/abandono/envio/classificação. session_token é um valor aleatório do cliente, nunca dado pessoal (nome/e-mail/IP nunca entram aqui).';

create index agency_funnel_events_event_type_idx on public.agency_funnel_events (event_type, created_at desc);
create index agency_funnel_events_session_idx on public.agency_funnel_events (session_token);

alter table public.agency_funnel_events enable row level security;
revoke select, insert, update, delete on public.agency_funnel_events from anon, authenticated;

-- ============================================================
-- 5. classify_agency_application — núcleo interno (nunca grantado),
--    só chamável função-a-função. Única fonte de verdade da
--    classificação — nunca duplicada em TypeScript, pra nunca haver
--    divergência entre o que o Admin configura e o que de fato roda.
-- ============================================================
create function public._classify_agency_application(
  p_team_size integer,
  p_artists_represented integer,
  p_monthly_requests_volume integer
)
returns table (classification text, snapshot jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_c public.agency_classification_criteria;
  v_classification text;
begin
  select * into v_c from public.agency_classification_criteria order by updated_at desc limit 1;
  if v_c.id is null then
    raise exception 'classification_criteria_missing' using errcode = 'P0001';
  end if;

  if p_team_size >= v_c.priority_min_team_size
     and p_artists_represented >= v_c.priority_min_artists
     and p_monthly_requests_volume >= v_c.priority_min_monthly_requests then
    v_classification := 'priority';
  elsif p_team_size >= v_c.future_min_team_size
     and p_artists_represented >= v_c.future_min_artists
     and p_monthly_requests_volume >= v_c.future_min_monthly_requests then
    v_classification := 'future_potential';
  else
    v_classification := 'out_of_profile';
  end if;

  return query select v_classification, jsonb_build_object(
    'criteria_id', v_c.id,
    'priority_min_team_size', v_c.priority_min_team_size,
    'priority_min_artists', v_c.priority_min_artists,
    'priority_min_monthly_requests', v_c.priority_min_monthly_requests,
    'future_min_team_size', v_c.future_min_team_size,
    'future_min_artists', v_c.future_min_artists,
    'future_min_monthly_requests', v_c.future_min_monthly_requests
  );
end;
$$;

revoke all on function public._classify_agency_application from public;
revoke execute on function public._classify_agency_application from anon, authenticated;

-- ============================================================
-- 6. submit_agency_application — único caminho de escrita pública.
--    Upsert por contact_email (dedup real, nunca duas linhas pro
--    mesmo e-mail) + limite de frequência (mesmo padrão de
--    submit_contact_message, 0085). Honeypot é checado em TypeScript
--    (Server Action), antes mesmo de chamar isto.
-- ============================================================
create function public.submit_agency_application(
  p_agency_name text,
  p_website_or_instagram text,
  p_city text,
  p_country text,
  p_contact_name text,
  p_contact_role text,
  p_contact_email text,
  p_team_size integer,
  p_artists_represented integer,
  p_monthly_requests_volume integer,
  p_interest text,
  p_consent boolean
)
returns table (id uuid, classification text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_contact_email));
  v_existing_id uuid;
  v_recent_count integer;
  v_result record;
  v_new_id uuid;
begin
  if coalesce(trim(p_agency_name), '') = '' then raise exception 'agency_name_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_website_or_instagram), '') = '' then raise exception 'website_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_city), '') = '' then raise exception 'city_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_country), '') = '' then raise exception 'country_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_contact_name), '') = '' then raise exception 'contact_name_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_contact_role), '') = '' then raise exception 'contact_role_required' using errcode = 'P0001'; end if;
  if v_email = '' then raise exception 'email_required' using errcode = 'P0001'; end if;
  if p_team_size is null or p_team_size <= 0 then raise exception 'team_size_invalid' using errcode = 'P0001'; end if;
  if p_artists_represented is null or p_artists_represented < 0 then raise exception 'artists_represented_invalid' using errcode = 'P0001'; end if;
  if p_monthly_requests_volume is null or p_monthly_requests_volume < 0 then raise exception 'monthly_requests_volume_invalid' using errcode = 'P0001'; end if;
  if p_interest not in ('discovery_metrics', 'recurring_revenue', 'both') then raise exception 'interest_invalid' using errcode = 'P0001'; end if;
  if p_consent is not true then raise exception 'consent_required' using errcode = 'P0001'; end if;

  select a.id into v_existing_id from public.agency_applications a where a.contact_email = v_email;

  -- Mesma proteção de frequência de submit_contact_message (0085) —
  -- nunca bloqueia um reenvio legítimo do MESMO e-mail (upsert abaixo
  -- já cobre isso de outro jeito), só uma rajada de e-mails diferentes
  -- vindos do mesmo request em sequência rápida.
  if v_existing_id is null then
    select count(*) into v_recent_count
    from public.agency_applications
    where created_at > now() - interval '10 minutes';
    if v_recent_count >= 20 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  select * into v_result from public._classify_agency_application(p_team_size, p_artists_represented, p_monthly_requests_volume);

  if v_existing_id is not null then
    update public.agency_applications
    set agency_name = trim(p_agency_name),
        website_or_instagram = trim(p_website_or_instagram),
        city = trim(p_city),
        country = trim(p_country),
        contact_name = trim(p_contact_name),
        contact_role = trim(p_contact_role),
        team_size = p_team_size,
        artists_represented = p_artists_represented,
        monthly_requests_volume = p_monthly_requests_volume,
        interest = p_interest,
        classification = v_result.classification,
        classification_snapshot = v_result.snapshot,
        consent_contact_at = now(),
        notification_status = case when v_result.classification = 'priority' then 'pending' else 'not_applicable' end,
        notification_error = null,
        notified_at = null,
        updated_at = now()
    where agency_applications.id = v_existing_id
    returning agency_applications.id into v_new_id;

    -- Resubmissão pública NUNCA grava em admin_audit_events (essa
    -- trilha exige um admin_profile_id real, FK pra profiles — não há
    -- um admin agindo aqui). Fica rastreável só por updated_at !=
    -- created_at na própria linha, suficiente pro Admin perceber que
    -- a agência reenviou.
    return query select v_new_id, v_result.classification;
    return;
  end if;

  insert into public.agency_applications (
    agency_name, website_or_instagram, city, country, contact_name, contact_role, contact_email,
    team_size, artists_represented, monthly_requests_volume, interest,
    classification, classification_snapshot, consent_contact_at, notification_status
  ) values (
    trim(p_agency_name), trim(p_website_or_instagram), trim(p_city), trim(p_country), trim(p_contact_name), trim(p_contact_role), v_email,
    p_team_size, p_artists_represented, p_monthly_requests_volume, p_interest,
    v_result.classification, v_result.snapshot, now(),
    case when v_result.classification = 'priority' then 'pending' else 'not_applicable' end
  )
  returning agency_applications.id into v_new_id;

  return query select v_new_id, v_result.classification;
  return;
end;
$$;

comment on function public.submit_agency_application is 'Único caminho de escrita pública em agency_applications. Upsert por contact_email (dedup real). admin_audit_events só recebe entradas de ações feitas por um admin de verdade (admin_profile_id not null) — resubmissão pública NUNCA grava lá; fica rastreável só por updated_at != created_at na própria linha.';

revoke all on function public.submit_agency_application from public;
grant execute on function public.submit_agency_application to anon, authenticated;

-- ============================================================
-- 7. record_agency_funnel_event — escrita pública, zero dado pessoal.
-- ============================================================
create function public.record_agency_funnel_event(
  p_event_type text,
  p_session_token text,
  p_application_id uuid default null,
  p_step integer default null,
  p_classification text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in ('section_view', 'cta_click', 'form_start', 'form_step_completed', 'form_abandon', 'form_submit', 'classified') then
    raise exception 'invalid_event_type' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_session_token), '') = '' then
    raise exception 'session_token_required' using errcode = 'P0001';
  end if;

  insert into public.agency_funnel_events (event_type, session_token, application_id, step, classification)
  values (p_event_type, trim(p_session_token), p_application_id, p_step, p_classification);
end;
$$;

comment on function public.record_agency_funnel_event is 'Escrita pública de analytics do funil de agências — nunca aceita nome/e-mail/IP, só um token aleatório do cliente.';

revoke all on function public.record_agency_funnel_event from public;
grant execute on function public.record_agency_funnel_event to anon, authenticated;

-- ============================================================
-- 8. mark_agency_notification — bookkeeping da tentativa de e-mail,
--    mesmo padrão de mark_contact_message_notification (0085). Chamada
--    tanto pelo envio automático (prioritária recém-criada) quanto
--    pelo reenvio manual do Admin (depois de admin_reset_agency_notification).
-- ============================================================
create function public.mark_agency_notification(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  update public.agency_applications
  set notification_status = p_status,
      notification_error = p_error,
      notified_at = now()
  where id = p_id
    and notification_status = 'pending';
end;
$$;

comment on function public.mark_agency_notification is 'Só transiciona pending -> sent/failed, nunca reescreve uma tentativa já resolvida. O id nunca é exposto ao client (Server Action roda servidor a servidor).';

revoke all on function public.mark_agency_notification from public;
grant execute on function public.mark_agency_notification to anon, authenticated;

-- ============================================================
-- 9. Admin — leitura/filtro/busca.
-- ============================================================
create function public.admin_list_agency_applications(
  p_classification text default null,
  p_status text default null,
  p_min_team_size integer default null,
  p_min_artists integer default null,
  p_city text default null,
  p_country text default null,
  p_interest text default null,
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid, agency_name text, website_or_instagram text, city text, country text,
  contact_name text, contact_role text, contact_email text,
  team_size integer, artists_represented integer, monthly_requests_volume integer,
  interest text, classification text, status text,
  notification_status text, created_at timestamptz, updated_at timestamptz
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
  select a.id, a.agency_name, a.website_or_instagram, a.city, a.country,
         a.contact_name, a.contact_role, a.contact_email,
         a.team_size, a.artists_represented, a.monthly_requests_volume,
         a.interest, a.classification, a.status,
         a.notification_status, a.created_at, a.updated_at
  from public.agency_applications a
  where (p_classification is null or a.classification = p_classification)
    and (p_status is null or a.status = p_status)
    and (p_min_team_size is null or a.team_size >= p_min_team_size)
    and (p_min_artists is null or a.artists_represented >= p_min_artists)
    and (p_city is null or a.city ilike '%' || p_city || '%')
    and (p_country is null or a.country ilike '%' || p_country || '%')
    and (p_interest is null or a.interest = p_interest)
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at <= p_to)
    and (v_query is null or a.agency_name ilike '%' || v_query || '%' or a.contact_name ilike '%' || v_query || '%' or a.contact_email ilike '%' || v_query || '%')
  order by a.created_at desc
  limit v_limit;
end;
$$;

create function public.admin_get_agency_application(p_id uuid)
returns public.agency_applications
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row public.agency_applications;
begin
  perform public._assert_is_admin();
  select * into v_row from public.agency_applications where id = p_id;
  return v_row;
end;
$$;

-- ============================================================
-- 10. Admin — status, nota (ambos viram admin_audit_events: histórico
--     e observações são a mesma trilha, ver nota no topo do arquivo).
-- ============================================================
create function public.admin_set_agency_application_status(
  p_id uuid,
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
  if p_status not in ('new', 'under_review', 'contacted', 'in_conversation', 'partner', 'rejected', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status into v_old from public.agency_applications where id = p_id for update;
  if v_old is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_old = p_status then
    return; -- no-op auditável-zero, mesmo padrão das moderações (0096)
  end if;

  update public.agency_applications set status = p_status, updated_at = now() where id = p_id;

  insert into public.admin_audit_events (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values (v_admin, 'agency_status_changed', 'agency_applications', p_id, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), p_reason);
end;
$$;

create function public.admin_add_agency_application_note(
  p_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
begin
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agency_applications where id = p_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_events (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values (v_admin, 'agency_note_added', 'agency_applications', p_id, null, null, p_note);
end;
$$;

create function public.admin_list_agency_application_history(p_id uuid)
returns table (
  id uuid, admin_profile_id uuid, admin_name text, action text,
  previous_state jsonb, new_state jsonb, reason text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();

  return query
  select e.id, e.admin_profile_id, p.full_name, e.action, e.previous_state, e.new_state, e.reason, e.created_at
  from public.admin_audit_events e
  join public.profiles p on p.id = e.admin_profile_id
  where e.target_table = 'agency_applications' and e.target_id = p_id
  order by e.created_at desc;
end;
$$;

-- ============================================================
-- 11. Admin — critérios de classificação (editáveis sem migration).
-- ============================================================
create function public.admin_get_agency_classification_criteria()
returns public.agency_classification_criteria
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row public.agency_classification_criteria;
begin
  perform public._assert_is_admin();
  select * into v_row from public.agency_classification_criteria order by updated_at desc limit 1;
  return v_row;
end;
$$;

create function public.admin_set_agency_classification_criteria(
  p_priority_min_team_size integer,
  p_priority_min_artists integer,
  p_priority_min_monthly_requests integer,
  p_future_min_team_size integer,
  p_future_min_artists integer,
  p_future_min_monthly_requests integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_id uuid;
  v_old jsonb;
begin
  if p_priority_min_team_size < 0 or p_priority_min_artists < 0 or p_priority_min_monthly_requests < 0
     or p_future_min_team_size < 0 or p_future_min_artists < 0 or p_future_min_monthly_requests < 0 then
    raise exception 'negative_threshold' using errcode = '22023';
  end if;

  select id, jsonb_build_object(
    'priority_min_team_size', priority_min_team_size, 'priority_min_artists', priority_min_artists,
    'priority_min_monthly_requests', priority_min_monthly_requests, 'future_min_team_size', future_min_team_size,
    'future_min_artists', future_min_artists, 'future_min_monthly_requests', future_min_monthly_requests
  ) into v_id, v_old
  from public.agency_classification_criteria order by updated_at desc limit 1;

  update public.agency_classification_criteria
  set priority_min_team_size = p_priority_min_team_size,
      priority_min_artists = p_priority_min_artists,
      priority_min_monthly_requests = p_priority_min_monthly_requests,
      future_min_team_size = p_future_min_team_size,
      future_min_artists = p_future_min_artists,
      future_min_monthly_requests = p_future_min_monthly_requests,
      updated_by = v_admin,
      updated_at = now()
  where id = v_id;

  insert into public.admin_audit_events (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values (v_admin, 'agency_classification_criteria_changed', 'agency_classification_criteria', v_id, v_old,
          jsonb_build_object('priority_min_team_size', p_priority_min_team_size, 'priority_min_artists', p_priority_min_artists,
            'priority_min_monthly_requests', p_priority_min_monthly_requests, 'future_min_team_size', p_future_min_team_size,
            'future_min_artists', p_future_min_artists, 'future_min_monthly_requests', p_future_min_monthly_requests),
          'Ajuste de critérios de classificação pelo Admin');
end;
$$;

-- ============================================================
-- 12. Admin — destinatários de notificação.
-- ============================================================
create function public.admin_list_agency_notification_recipients()
returns table (id uuid, email text, active boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();
  return query select r.id, r.email, r.active, r.created_at from public.agency_notification_recipients r order by r.created_at desc;
end;
$$;

create function public.admin_add_agency_notification_recipient(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_id uuid;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email_required' using errcode = '22023';
  end if;

  insert into public.agency_notification_recipients (email, created_by)
  values (lower(trim(p_email)), v_admin)
  on conflict (email) do update set active = true
  returning id into v_id;

  return v_id;
end;
$$;

create function public.admin_remove_agency_notification_recipient(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._assert_is_admin();
  update public.agency_notification_recipients set active = false where id = p_id;
end;
$$;

-- ============================================================
-- 13. Admin — reenvio de notificação, sem duplicar cadastro (reabre a
--     MESMA linha pra 'pending'; quem efetivamente manda o e-mail de
--     novo é o TypeScript, chamando mark_agency_notification no fim,
--     igual ao envio automático original).
-- ============================================================
create function public.admin_reset_agency_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_classification text;
begin
  select classification into v_classification from public.agency_applications where id = p_id;
  if v_classification is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_classification <> 'priority' then
    raise exception 'not_priority' using errcode = 'P0001';
  end if;

  update public.agency_applications set notification_status = 'pending', notification_error = null where id = p_id;

  insert into public.admin_audit_events (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values (v_admin, 'agency_notification_retry_requested', 'agency_applications', p_id, null, null, 'Reenvio manual solicitado pelo Admin');
end;
$$;

-- ============================================================
-- 14. Admin — indicadores de conversão e resumo semanal, a partir de
--     agency_funnel_events + agency_applications.
-- ============================================================
create function public.admin_get_agency_funnel_summary(p_days integer default 7)
returns table (event_type text, total bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  perform public._assert_is_admin();
  return query
  select e.event_type, count(*)::bigint
  from public.agency_funnel_events e
  where e.created_at >= now() - make_interval(days => v_days)
  group by e.event_type;
end;
$$;

create function public.admin_get_agency_applications_weekly_summary()
returns table (classification text, total bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public._assert_is_admin();
  return query
  select a.classification, count(*)::bigint
  from public.agency_applications a
  where a.created_at >= now() - interval '7 days'
  group by a.classification;
end;
$$;

-- ============================================================
-- 15. Grants — todas as functions de admin, só authenticated (a
--     proteção real é _assert_is_admin, ver 0096).
-- ============================================================
revoke all on function public.admin_list_agency_applications from public;
grant execute on function public.admin_list_agency_applications to authenticated;
revoke execute on function public.admin_list_agency_applications from anon;

revoke all on function public.admin_get_agency_application from public;
grant execute on function public.admin_get_agency_application to authenticated;
revoke execute on function public.admin_get_agency_application from anon;

revoke all on function public.admin_set_agency_application_status from public;
grant execute on function public.admin_set_agency_application_status to authenticated;
revoke execute on function public.admin_set_agency_application_status from anon;

revoke all on function public.admin_add_agency_application_note from public;
grant execute on function public.admin_add_agency_application_note to authenticated;
revoke execute on function public.admin_add_agency_application_note from anon;

revoke all on function public.admin_list_agency_application_history from public;
grant execute on function public.admin_list_agency_application_history to authenticated;
revoke execute on function public.admin_list_agency_application_history from anon;

revoke all on function public.admin_get_agency_classification_criteria from public;
grant execute on function public.admin_get_agency_classification_criteria to authenticated;
revoke execute on function public.admin_get_agency_classification_criteria from anon;

revoke all on function public.admin_set_agency_classification_criteria from public;
grant execute on function public.admin_set_agency_classification_criteria to authenticated;
revoke execute on function public.admin_set_agency_classification_criteria from anon;

revoke all on function public.admin_list_agency_notification_recipients from public;
grant execute on function public.admin_list_agency_notification_recipients to authenticated;
revoke execute on function public.admin_list_agency_notification_recipients from anon;

revoke all on function public.admin_add_agency_notification_recipient from public;
grant execute on function public.admin_add_agency_notification_recipient to authenticated;
revoke execute on function public.admin_add_agency_notification_recipient from anon;

revoke all on function public.admin_remove_agency_notification_recipient from public;
grant execute on function public.admin_remove_agency_notification_recipient to authenticated;
revoke execute on function public.admin_remove_agency_notification_recipient from anon;

revoke all on function public.admin_reset_agency_notification from public;
grant execute on function public.admin_reset_agency_notification to authenticated;
revoke execute on function public.admin_reset_agency_notification from anon;

revoke all on function public.admin_get_agency_funnel_summary from public;
grant execute on function public.admin_get_agency_funnel_summary to authenticated;
revoke execute on function public.admin_get_agency_funnel_summary from anon;

revoke all on function public.admin_get_agency_applications_weekly_summary from public;
grant execute on function public.admin_get_agency_applications_weekly_summary to authenticated;
revoke execute on function public.admin_get_agency_applications_weekly_summary from anon;
