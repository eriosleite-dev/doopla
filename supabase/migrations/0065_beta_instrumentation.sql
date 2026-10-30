-- Doopla Intelligence Core v1 — Beta Instrumentation.
--
-- 5 tabelas novas, todas capture-only (nunca interpretação/agregação/
-- score/causalidade neste bloco): product_events (Product+Value events,
-- envelope único, category restrita/event_type livre — registry
-- canônico vive em src/lib/beta-instrumentation/event-types.ts),
-- intervention_moments + intervention_moment_reason_events (correction/
-- edit/rejection/undo/takeover — NUNCA 'approval', que é behavioral
-- feedback positivo derivável de approval_records/approval_resolutions,
-- nunca duplicado aqui), professional_feedback_checkins (feedback
-- explícito, ciclo próprio, nunca confundido com `reviews` que é
-- reputação Booker<->Artista), orchestrator_run_context_evidence
-- (persistência detalhada da camada A de EvidenceUsed — context/
-- reasoning evidence, nunca autoriza compromisso sozinha).
--
-- Fora de escopo (decisão do usuário): Career Intelligence/Pattern
-- Engine, Lifecycle Messaging completo, capabilities de Booker,
-- dashboard de analytics, classificação síncrona de probable_reason
-- (fica null/'unclassified' até um job assíncrono futuro), cálculo de
-- custo de canal (WhatsApp) — proveniência já preservada nas tabelas
-- existentes (outbound_intents.send_as/provider_message_id/sent_at),
-- nenhuma coluna nova pra isso.

-- ============================================================
-- 1. product_events — envelope único (Product Events + Value Events).
-- category tem CHECK (taxonomia arquitetural pequena e estável,
-- 'lifecycle' já incluída e reservada pro futuro bloco de Lifecycle
-- Messaging, sem uso neste bloco); event_type é texto livre — a lista
-- canônica vive em código (event-types.ts), nunca uma segunda fonte de
-- verdade no banco, pra crescer em blocos futuros sem migration.
-- ============================================================

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  event_type text not null,
  -- occurred_at = quando o fato aconteceu de verdade; recorded_at =
  -- quando foi gravado. Nunca colapsados: retry/reprocessamento não
  -- pode distorcer TTV/funil usando o timestamp de ingestão por engano.
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  idempotency_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  commercial_root_id uuid,
  conversation_id uuid references public.conversations(id) on delete set null,
  run_id uuid references public.orchestrator_runs(id) on delete set null,
  source_message_id uuid references public.conversation_messages(id) on delete set null,
  actor_type text,
  payload jsonb not null default '{}'::jsonb,
  -- Reservadas pro futuro Lifecycle Messaging (scheduled/due/suppressed/
  -- sent/delivered/responded/resolved/cancelled/escalated e conceitos
  -- why_now/DECISION/RISK/RESOLVED/OPPORTUNITY) — sempre null neste
  -- bloco, nenhum event_type atual as usa. Existir agora evita uma
  -- ALTER TABLE quando aquele bloco chegar.
  why_now text,
  signal_type text,
  source text not null,
  created_at timestamptz not null default now(),
  constraint product_events_category_check check (category = any (array['product', 'value', 'lifecycle'])),
  constraint product_events_actor_type_check check (actor_type is null or actor_type = any (array['professional', 'external_participant', 'ai', 'system'])),
  constraint product_events_signal_type_check check (signal_type is null or signal_type = any (array['decision', 'risk', 'resolved', 'opportunity'])),
  constraint product_events_source_check check (source = any (array['runtime', 'dashboard', 'webhook', 'cron']))
);

comment on table public.product_events is 'Beta Instrumentation — envelope único de fatos operacionais (Product Events) e de valor (Value Events). Nunca interpretado/agregado aqui — captura pura. category restrita por CHECK; event_type livre, validado só pelo registry em código (src/lib/beta-instrumentation/event-types.ts).';

create unique index product_events_idempotency_idx on public.product_events (professional_id, idempotency_key);
create index product_events_professional_occurred_idx on public.product_events (professional_id, occurred_at desc);
create index product_events_event_type_idx on public.product_events (professional_id, event_type, occurred_at desc);
create index product_events_commercial_root_idx on public.product_events (commercial_root_id) where commercial_root_id is not null;

alter table public.product_events enable row level security;

create policy "product_events: select own" on public.product_events
  for select using (auth.uid() = professional_id);

-- ============================================================
-- 2. intervention_moments + intervention_moment_reason_events.
-- intervention_type V1 = correction/edit/rejection/undo/takeover —
-- NUNCA 'approval' (decisão do usuário: aprovação positiva é behavioral
-- feedback derivável de approval_records/approval_resolutions, nunca
-- duplicado aqui, e "ausência de intervenção" NUNCA é tratada como
-- sinal positivo — não há CHECK nem lógica alguma neste bloco que
-- infira aprovação da ausência de uma linha aqui).
--
-- probable_reason nasce sempre null/'unclassified' neste bloco (nenhum
-- model call síncrono) — reason_status existe só pra um job assíncrono
-- futuro filtrar o que falta classificar, sem adivinhar.
--
-- Correção NUNCA destrói histórico: intervention_moments carrega só o
-- snapshot atual (mutável); intervention_moment_reason_events é
-- append-only, cada linha uma classificação/correção real, mesmo
-- idioma de conversation_mandate_events/conversation_state_events.
-- ============================================================

create table public.intervention_moments (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  commercial_root_id uuid,
  booking_id uuid references public.bookings(id) on delete set null,
  run_id uuid not null references public.orchestrator_runs(id) on delete cascade,
  outbound_intent_id uuid references public.outbound_intents(id) on delete set null,
  original_message_id uuid references public.conversation_messages(id) on delete set null,
  detected_message_id uuid references public.conversation_messages(id) on delete set null,
  intervention_type text not null,
  probable_reason text,
  reason_status text not null default 'unclassified',
  reason_classified_by text,
  reason_classifier_version text,
  outcome text not null default 'unresolved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intervention_moments_intervention_type_check check (
    intervention_type = any (array['correction', 'edit', 'rejection', 'undo', 'takeover'])
  ),
  constraint intervention_moments_probable_reason_check check (
    probable_reason is null or probable_reason = any (array[
      'price_or_condition_incorrect', 'inadequate_tone', 'lost_context', 'unnecessary_approval',
      'missing_information', 'wrong_interpretation', 'personal_preference', 'other'
    ])
  ),
  constraint intervention_moments_reason_status_check check (reason_status = any (array['unclassified', 'classified', 'corrected'])),
  constraint intervention_moments_reason_classified_by_check check (reason_classified_by is null or reason_classified_by = any (array['system', 'professional', 'admin'])),
  constraint intervention_moments_reason_status_consistency check (
    (reason_status = 'unclassified') = (probable_reason is null and reason_classified_by is null)
  ),
  constraint intervention_moments_outcome_check check (
    outcome = any (array['reverted', 'corrected_and_resent', 'conversation_taken_over', 'no_further_action', 'unresolved'])
  )
);

comment on table public.intervention_moments is 'Beta Instrumentation — momentos em que o profissional corrigiu/editou/rejeitou/desfez/assumiu uma ação ou sugestão da Doopla. intervention_type NUNCA inclui approval (behavioral feedback positivo é derivado de approval_records/approval_resolutions, nunca duplicado aqui). Snapshot mutável de classificação — histórico real em intervention_moment_reason_events.';

create index intervention_moments_professional_idx on public.intervention_moments (professional_id, created_at desc);
create index intervention_moments_run_idx on public.intervention_moments (run_id);
create index intervention_moments_unclassified_idx on public.intervention_moments (professional_id) where reason_status = 'unclassified';

alter table public.intervention_moments enable row level security;

create policy "intervention_moments: select own" on public.intervention_moments
  for select using (auth.uid() = professional_id);

create table public.intervention_moment_reason_events (
  id uuid primary key default gen_random_uuid(),
  intervention_moment_id uuid not null references public.intervention_moments(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  previous_reason text,
  new_reason text not null,
  classified_by text not null,
  classifier_version text,
  reason_for_change text,
  created_at timestamptz not null default now(),
  constraint intervention_moment_reason_events_new_reason_check check (
    new_reason = any (array[
      'price_or_condition_incorrect', 'inadequate_tone', 'lost_context', 'unnecessary_approval',
      'missing_information', 'wrong_interpretation', 'personal_preference', 'other'
    ])
  ),
  constraint intervention_moment_reason_events_classified_by_check check (classified_by = any (array['system', 'professional', 'admin']))
);

comment on table public.intervention_moment_reason_events is 'Beta Instrumentation — trilha append-only de toda classificação/correção de probable_reason. Nunca sobrescrita; intervention_moments.probable_reason é sempre o snapshot da última linha aqui.';

create index intervention_moment_reason_events_moment_idx on public.intervention_moment_reason_events (intervention_moment_id, created_at);

alter table public.intervention_moment_reason_events enable row level security;

create policy "intervention_moment_reason_events: select own" on public.intervention_moment_reason_events
  for select using (auth.uid() = professional_id);

-- ============================================================
-- 3. professional_feedback_checkins — feedback EXPLÍCITO, nunca
-- confundido com `reviews` (reputação Booker<->Artista). Mesmo idioma
-- de ciclo de vida de `reviews` (status pending/answered/skipped/
-- expired, requested_at/responded_at).
-- ============================================================

create table public.professional_feedback_checkins (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  checkin_type text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  rating smallint,
  comment text,
  created_at timestamptz not null default now(),
  constraint professional_feedback_checkins_checkin_type_check check (
    checkin_type = any (array['first_booking', 'fifth_booking', 'periodic', 'ad_hoc'])
  ),
  constraint professional_feedback_checkins_status_check check (status = any (array['pending', 'answered', 'skipped', 'expired'])),
  constraint professional_feedback_checkins_rating_check check (rating is null or (rating between 1 and 5)),
  constraint professional_feedback_checkins_responded_check check ((status = 'answered') = (responded_at is not null))
);

comment on table public.professional_feedback_checkins is 'Beta Instrumentation — feedback EXPLÍCITO sobre a performance da Doopla ("como foi?"), distinto de reviews (reputação Booker<->Artista por booking) e de intervention_moments (feedback comportamental/implícito).';

create unique index professional_feedback_checkins_one_per_booking_idx
  on public.professional_feedback_checkins (professional_id, booking_id, checkin_type)
  where booking_id is not null;
create index professional_feedback_checkins_professional_idx on public.professional_feedback_checkins (professional_id, requested_at desc);

alter table public.professional_feedback_checkins enable row level security;

create policy "professional_feedback_checkins: select own" on public.professional_feedback_checkins
  for select using (auth.uid() = professional_id);

-- ============================================================
-- 4. orchestrator_run_context_evidence — persistência detalhada da
-- camada A (EvidenceUsed[] completo, ver planner/invariants.ts).
-- is_commitment_authorizing é um SNAPSHOT no momento da escrita
-- (COMMITMENT_AUTHORIZING_SOURCE_TYPES) — nunca recalculado depois,
-- pra nunca reescrever história se o whitelist mudar no futuro.
-- ============================================================

create table public.orchestrator_run_context_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.orchestrator_runs(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  field text,
  is_commitment_authorizing boolean not null,
  created_at timestamptz not null default now(),
  constraint orchestrator_run_context_evidence_source_type_check check (
    source_type = any (array[
      'professional_profile', 'opportunity', 'booking', 'external_participant',
      'professional_business_context', 'professional_commercial_history', 'conversation_message'
    ])
  )
);

comment on table public.orchestrator_run_context_evidence is 'Beta Instrumentation — camada A (context/reasoning evidence) persistida em detalhe, uma linha por EvidenceUsed grounded do run. is_commitment_authorizing é snapshot histórico do whitelist no momento da escrita, nunca recalculado. Nunca, sozinha, autoriza nada — só auditoria de "o que a Doopla usou".';

create unique index orchestrator_run_context_evidence_dedupe_idx
  on public.orchestrator_run_context_evidence (run_id, source_type, source_id, coalesce(field, ''));
create index orchestrator_run_context_evidence_professional_idx on public.orchestrator_run_context_evidence (professional_id, created_at desc);

alter table public.orchestrator_run_context_evidence enable row level security;

create policy "orchestrator_run_context_evidence: select own" on public.orchestrator_run_context_evidence
  for select using (auth.uid() = professional_id);

-- ============================================================
-- 5. RPCs — mesmo padrão de sempre: auth.uid() = p_professional_id OR
-- is_system_caller(), nunca um atalho de service_role sem essa
-- checagem, filtro explícito sempre presente mesmo sob service_role.
-- ============================================================

create function public.record_product_event(
  p_professional_id uuid,
  p_category text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_idempotency_key text,
  p_subject_type text,
  p_subject_id uuid,
  p_commercial_root_id uuid default null,
  p_conversation_id uuid default null,
  p_run_id uuid default null,
  p_source_message_id uuid default null,
  p_actor_type text default null,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'runtime'
)
returns table (id uuid, inserted boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is distinct from p_professional_id and not is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.product_events (
    professional_id, category, event_type, occurred_at, idempotency_key,
    subject_type, subject_id, commercial_root_id, conversation_id, run_id,
    source_message_id, actor_type, payload, source
  )
  values (
    p_professional_id, p_category, p_event_type, p_occurred_at, p_idempotency_key,
    p_subject_type, p_subject_id, p_commercial_root_id, p_conversation_id, p_run_id,
    p_source_message_id, p_actor_type, coalesce(p_payload, '{}'::jsonb), p_source
  )
  on conflict (professional_id, idempotency_key) do nothing
  returning product_events.id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  -- Já existia (idempotência) — devolve o id existente, nunca um erro.
  select product_events.id into v_id from public.product_events
    where professional_id = p_professional_id and idempotency_key = p_idempotency_key;
  return query select v_id, false;
end;
$$;

comment on function public.record_product_event is 'Único caminho de escrita de product_events. Idempotente por (professional_id, idempotency_key) — chamada repetida (retry) nunca duplica, sempre devolve o id real.';

revoke all on function public.record_product_event from public;
grant execute on function public.record_product_event to authenticated, service_role;
revoke execute on function public.record_product_event from anon;

create function public.record_intervention_moment(
  p_professional_id uuid,
  p_conversation_id uuid,
  p_run_id uuid,
  p_intervention_type text,
  p_commercial_root_id uuid default null,
  p_booking_id uuid default null,
  p_outbound_intent_id uuid default null,
  p_original_message_id uuid default null,
  p_detected_message_id uuid default null
)
returns table (id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is distinct from p_professional_id and not is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.intervention_moments (
    professional_id, conversation_id, commercial_root_id, booking_id, run_id,
    outbound_intent_id, original_message_id, detected_message_id, intervention_type
  )
  values (
    p_professional_id, p_conversation_id, p_commercial_root_id, p_booking_id, p_run_id,
    p_outbound_intent_id, p_original_message_id, p_detected_message_id, p_intervention_type
  )
  returning intervention_moments.id into v_id;

  return query select v_id;
end;
$$;

comment on function public.record_intervention_moment is 'Registra o FATO de uma intervenção (V1: correction/edit/rejection/undo/takeover — nunca approval). Nasce sempre com probable_reason=null/reason_status=unclassified — nenhum model call síncrono aqui.';

revoke all on function public.record_intervention_moment from public;
grant execute on function public.record_intervention_moment to authenticated, service_role;
revoke execute on function public.record_intervention_moment from anon;

create function public.set_intervention_moment_reason(
  p_intervention_moment_id uuid,
  p_professional_id uuid,
  p_new_reason text,
  p_classified_by text,
  p_classifier_version text default null,
  p_reason_for_change text default null
)
returns table (id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_moment public.intervention_moments;
  v_previous_reason text;
begin
  if auth.uid() is distinct from p_professional_id and not is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Colunas qualificadas com o nome da tabela: esta function tem
  -- `returns table (id uuid)`, que cria um parâmetro OUT implícito
  -- chamado `id` neste escopo — um `where id = ...` desqualificado
  -- colide com ele (ambiguidade real, não cosmética).
  select * into v_moment from public.intervention_moments
    where intervention_moments.id = p_intervention_moment_id and professional_id = p_professional_id
    for update;
  if v_moment.id is null then
    raise exception 'intervention_moment_not_found' using errcode = '22023';
  end if;

  v_previous_reason := v_moment.probable_reason;

  -- Trilha append-only PRIMEIRO — nunca sobrescreve o snapshot sem
  -- registrar o histórico real da mudança.
  insert into public.intervention_moment_reason_events (
    intervention_moment_id, professional_id, previous_reason, new_reason, classified_by, classifier_version, reason_for_change
  )
  values (
    p_intervention_moment_id, p_professional_id, v_previous_reason, p_new_reason, p_classified_by, p_classifier_version, p_reason_for_change
  );

  update public.intervention_moments
    set probable_reason = p_new_reason,
        reason_status = case when v_previous_reason is null then 'classified' else 'corrected' end,
        reason_classified_by = p_classified_by,
        reason_classifier_version = p_classifier_version,
        updated_at = now()
    where intervention_moments.id = p_intervention_moment_id;

  return query select p_intervention_moment_id;
end;
$$;

comment on function public.set_intervention_moment_reason is 'Classifica ou corrige probable_reason — sempre grava em intervention_moment_reason_events (append-only) antes de atualizar o snapshot mutável. Nunca destrói histórico. Não chamada por nenhum caminho síncrono do Runtime neste bloco — arquitetura pronta pra um job assíncrono futuro.';

revoke all on function public.set_intervention_moment_reason from public;
grant execute on function public.set_intervention_moment_reason to authenticated, service_role;
revoke execute on function public.set_intervention_moment_reason from anon;

create function public.record_orchestrator_run_context_evidence(
  p_run_id uuid,
  p_professional_id uuid,
  p_evidence jsonb
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is distinct from p_professional_id and not is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.orchestrator_run_context_evidence (run_id, professional_id, source_type, source_id, field, is_commitment_authorizing)
  select
    p_run_id,
    p_professional_id,
    item ->> 'sourceType',
    item ->> 'sourceId',
    item ->> 'field',
    (item ->> 'isCommitmentAuthorizing')::boolean
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) as item
  on conflict (run_id, source_type, source_id, coalesce(field, '')) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.record_orchestrator_run_context_evidence is 'Persiste em lote a camada A (EvidenceUsed completo) de um run — uma chamada por run, nunca N round-trips. Idempotente por (run_id, source_type, source_id, field): retry nunca duplica.';

revoke all on function public.record_orchestrator_run_context_evidence from public;
grant execute on function public.record_orchestrator_run_context_evidence to authenticated, service_role;
revoke execute on function public.record_orchestrator_run_context_evidence from anon;

-- record_booking_closed_event — RPC dedicada (não o record_product_event
-- genérico) porque precisa checar correlação Doopla<->booking com
-- privilégio elevado: quem aceita um booking pode ser o BOOKER (sem
-- RLS de leitura sobre conversations/orchestrator_runs do artista) —
-- a checagem de correlação roda dentro do SECURITY DEFINER, nunca
-- depende de RLS do chamador. Sempre grava product.booking_closed;
-- só grava também value.booking_closed quando a correlação é real.
create function public.record_booking_closed_event(p_booking_id uuid)
returns table (product_event_id uuid, value_event_recorded boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_professional_id uuid;
  v_has_doopla_correlation boolean;
  v_product_event_id uuid;
  v_value_recorded boolean := false;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'booking_not_found' using errcode = '22023';
  end if;
  -- Só quem tem relação real com o booking (artista ou booker) pode
  -- disparar isto — nunca um terceiro sondando correlação.
  if auth.uid() is distinct from v_booking.artist_profile_id
     and auth.uid() is distinct from v_booking.booker_profile_id
     and not is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- "Valor" é sempre no contexto do PROFISSIONAL representado (nunca
  -- do booker) — o tenant deste evento é sempre o artista do booking.
  v_professional_id := v_booking.artist_profile_id;

  select exists (
    select 1 from public.conversations c
    join public.orchestrator_runs r on r.conversation_id = c.id
    where c.represented_professional_id = v_professional_id
      and (
        c.related_booking_id = p_booking_id
        or (v_booking.originated_from_opportunity_id is not null and c.related_opportunity_id = v_booking.originated_from_opportunity_id)
      )
  ) into v_has_doopla_correlation;

  insert into public.product_events (professional_id, category, event_type, occurred_at, idempotency_key, subject_type, subject_id, source)
  values (v_professional_id, 'product', 'product.booking_closed', now(), 'booking_closed:' || p_booking_id::text, 'booking', p_booking_id, 'dashboard')
  on conflict (professional_id, idempotency_key) do nothing
  returning product_events.id into v_product_event_id;

  if v_product_event_id is null then
    select product_events.id into v_product_event_id from public.product_events
      where professional_id = v_professional_id and idempotency_key = 'booking_closed:' || p_booking_id::text;
  end if;

  -- Sempre TENTA (idempotente por si só via on conflict) quando há
  -- correlação — nunca condicionado a "o product event foi inserido
  -- NESTA chamada". Numa chamada repetida (retry), o product event já
  -- existe (v_product_event_id veio do select acima) mas o value event
  -- correspondente ainda precisa ser gravado/confirmado — sem isto, um
  -- retry reportaria value_event_recorded=false mesmo já tendo sido
  -- gravado antes, ou nunca gravaria de fato numa primeira falha
  -- parcial (produto ok, value não).
  if v_has_doopla_correlation then
    insert into public.product_events (professional_id, category, event_type, occurred_at, idempotency_key, subject_type, subject_id, source)
    values (v_professional_id, 'value', 'value.booking_closed', now(), 'value_booking_closed:' || p_booking_id::text, 'booking', p_booking_id, 'dashboard')
    on conflict (professional_id, idempotency_key) do nothing;
    v_value_recorded := true;
  end if;

  return query select v_product_event_id, v_value_recorded;
end;
$$;

comment on function public.record_booking_closed_event is 'Sempre grava product.booking_closed; grava também value.booking_closed só quando existe correlação real com uma conversa/run da Doopla (nunca um booking fechado 100% fora de qualquer interação mediada pela Doopla).';

revoke all on function public.record_booking_closed_event from public;
grant execute on function public.record_booking_closed_event to authenticated;
revoke execute on function public.record_booking_closed_event from anon, service_role;
