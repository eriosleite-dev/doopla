-- Doopla Intelligence Core v1 — Orchestrator / Runtime Integration
-- Layer. Transforma os blocos isolados (1–6) num pipeline real:
-- InboundEvent normalizado → idempotência → identidade/mandato →
-- persistência → inteligência → approval/policy → OutboundIntent.
--
-- Nenhuma integração de canal real (WhatsApp/Meta/Resend) nesta
-- migration — só a fundação de dados + o boundary server-only que o
-- Orchestrator (TS, src/lib/runtime/) usa.
--
-- Acordo de escopo, verificado empiricamente antes de escrever esta
-- migration (ver relatório da conversa): uma conexão service_role já
-- tem EXECUTE em toda function deste projeto via ALTER DEFAULT
-- PRIVILEGES do bootstrap (revoke ... from anon/grant ... to
-- authenticated de cada migration nunca tocou o grant de service_role
-- — mesma lição já registrada nas migrations 0041/0047 sobre anon).
-- O que falta não é grant — é a LÓGICA de autorização interna: toda
-- function sensível hoje começa com "if auth.uid() is null then
-- raise not_authorized", sem alternativa pra um caller de sistema.
-- Esta migration adiciona essa alternativa EXPLÍCITA (nunca
-- current_user/session_user — testado e descartado, current_user
-- dentro de SECURITY DEFINER é sempre o dono da function, nunca o
-- caller) só nas functions que o Orchestrator precisa chamar de
-- verdade, e só como condição ADICIONAL a auth.uid(), nunca
-- substituindo — todo caller autenticado comum continua exatamente
-- como antes.

-- ============================================================
-- 0. is_system_caller() — helper único, reusado em toda function
--    estendida abaixo. Nunca duplica a expressão em N lugares.
-- ============================================================
create function public.is_system_caller()
returns boolean
language sql
stable
as $$
  select coalesce((nullif(current_setting('request.jwt.claims', true), '')::json->>'role') = 'service_role', false);
$$;

comment on function public.is_system_caller is 'Orchestrator/Runtime — true quando o caller apresentou um JWT com role=service_role (mesmo GUC que auth.uid() já lê pro claim "sub", testado empiricamente: current_user/session_user NUNCA revelam o caller dentro de SECURITY DEFINER, current_user é sempre o dono da function). Só o processo server-only que detém o segredo service-role consegue produzir esse claim — nunca exposto ao browser. Usado só como condição ADICIONAL aos checks de auth.uid() já existentes, nunca substituindo.';

revoke all on function public.is_system_caller from public;
grant execute on function public.is_system_caller to authenticated, service_role;
revoke execute on function public.is_system_caller from anon;

-- ============================================================
-- 1. inbound_events — idempotência física de todo evento externo.
--    Primeira escrita do pipeline, sempre — nada roda sem passar por
--    aqui primeiro. Mesmo padrão de claim/lease já validado em
--    approval_resolution_claims (Bloco 5).
-- ============================================================
create table public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'email', 'painel', 'public_link', 'outro')),
  provider_event_id text not null,
  provider_message_id text,
  processing_status text not null default 'claimed' check (processing_status in ('claimed', 'processed', 'failed')),
  conversation_message_id uuid references public.conversation_messages (id) on delete set null,
  error text,
  lease_expires_at timestamptz not null,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (channel, provider_event_id)
);

comment on table public.inbound_events is 'Orchestrator/Runtime — ledger append-only de idempotência. Meta/Resend/qualquer provider pode reentregar o mesmo webhook — a PRIMEIRA coisa que o Orchestrator faz é reivindicar aqui; nada downstream roda se isso não retornar claimed=true. processing_status=processed é terminal (nunca reclaimed); claimed/failed podem ser reclaimed após lease_expires_at (worker travado/crashado nunca bloqueia o evento pra sempre).';

create index inbound_events_conversation_message_idx on public.inbound_events (conversation_message_id) where conversation_message_id is not null;

alter table public.inbound_events enable row level security;
-- Nenhuma policy pra authenticated/anon — estado interno do
-- Orchestrator, nunca lido diretamente por sessão de usuário (mesmo
-- padrão de approval_resolution_claims/backoff). service_role
-- bypassa RLS.

create function public.claim_inbound_event(
  p_channel text,
  p_provider_event_id text,
  p_provider_message_id text default null,
  p_lease_seconds integer default 300
)
returns table (claimed boolean, event_id uuid, already_processed boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.inbound_events;
  v_new_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.inbound_events (channel, provider_event_id, provider_message_id, lease_expires_at)
  values (p_channel, p_provider_event_id, p_provider_message_id, now() + make_interval(secs => p_lease_seconds))
  on conflict (channel, provider_event_id) do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    return query select true, v_new_id, false;
    return;
  end if;

  -- Já existia — decide se pode ser reivindicado de novo (claimed/failed
  -- com lease vencido, ou failed com lease ainda válido) ou se está
  -- genuinamente em voo/já concluído.
  select * into v_existing from public.inbound_events
  where channel = p_channel and provider_event_id = p_provider_event_id
  for update;

  if v_existing.processing_status = 'processed' then
    return query select false, v_existing.id, true;
    return;
  end if;

  if v_existing.processing_status = 'failed' or v_existing.lease_expires_at < now() then
    update public.inbound_events
    set processing_status = 'claimed', lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        provider_message_id = coalesce(provider_message_id, p_provider_message_id), updated_at = now()
    where id = v_existing.id;
    return query select true, v_existing.id, false;
    return;
  end if;

  -- claimed, lease ainda válido — outro worker já está processando.
  return query select false, v_existing.id, false;
end;
$$;

comment on function public.claim_inbound_event is 'Orchestrator/Runtime — único ponto de entrada de idempotência. claimed=false + already_processed=true = evento já processado de verdade, curto-circuita tudo. claimed=false + already_processed=false = outro worker já está processando agora (lease ainda válido) — nunca processa em paralelo.';

revoke all on function public.claim_inbound_event from public;
grant execute on function public.claim_inbound_event to service_role;
revoke execute on function public.claim_inbound_event from anon, authenticated;

create function public.finish_inbound_event(p_event_id uuid, p_status text, p_conversation_message_id uuid default null, p_error text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('processed', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.inbound_events
  set processing_status = p_status, conversation_message_id = coalesce(p_conversation_message_id, conversation_message_id),
      error = p_error, updated_at = now()
  where id = p_event_id;

  return found;
end;
$$;

revoke all on function public.finish_inbound_event from public;
grant execute on function public.finish_inbound_event to service_role;
revoke execute on function public.finish_inbound_event from anon, authenticated;

-- ============================================================
-- 2. conversation_processing_leases — serializa processamento por
--    conversation (nunca lock global). Mesmo padrão de claim/lease de
--    approval_resolution_claims.
-- ============================================================
create table public.conversation_processing_leases (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  claimed_by text not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  claimed_at timestamptz not null default now()
);

comment on table public.conversation_processing_leases is 'Orchestrator/Runtime — no máximo um worker processando uma conversation por vez. Duas mensagens quase simultâneas, dois workers, retry após timeout: tudo serializado aqui, nunca um lock global.';

alter table public.conversation_processing_leases enable row level security;
-- Sem policy pra authenticated/anon — estado interno.

create function public.acquire_conversation_processing_lease(p_conversation_id uuid, p_worker_id text, p_lease_seconds integer default 120)
returns table (granted boolean, lease_token uuid, lease_expires_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_lease_token := gen_random_uuid();
  v_lease_expires_at := now() + make_interval(secs => p_lease_seconds);

  insert into public.conversation_processing_leases (conversation_id, claimed_by, lease_token, lease_expires_at)
  values (p_conversation_id, p_worker_id, v_lease_token, v_lease_expires_at)
  on conflict (conversation_id) do update
    set claimed_by = excluded.claimed_by, lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at, claimed_at = now()
  where public.conversation_processing_leases.lease_expires_at < now();

  if not found then
    return query select false, null::uuid, null::timestamptz;
    return;
  end if;

  return query select true, v_lease_token, v_lease_expires_at;
end;
$$;

revoke all on function public.acquire_conversation_processing_lease from public;
grant execute on function public.acquire_conversation_processing_lease to service_role;
revoke execute on function public.acquire_conversation_processing_lease from anon, authenticated;

create function public.release_conversation_processing_lease(p_conversation_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.conversation_processing_leases
  where conversation_id = p_conversation_id and lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.release_conversation_processing_lease from public;
grant execute on function public.release_conversation_processing_lease to service_role;
revoke execute on function public.release_conversation_processing_lease from anon, authenticated;

-- ============================================================
-- 3. Boundary server-only nas RPCs existentes que o Orchestrator
--    precisa chamar de verdade — SÓ estas, CREATE OR REPLACE com a
--    MESMA assinatura (exceto is_commercial_root_terminal, que ganha
--    um parâmetro novo opcional). Ownership continua sempre provada
--    estruturalmente (derivada de conversation_messages/conversations,
--    nunca de um parâmetro solto) — service_role nunca ganha "agir
--    como qualquer profissional", só ganha rodar sem sessão de
--    usuário anexada, sobre o que a própria linha já prova ser dele.
-- ============================================================

create or replace function public.create_conversation(
  p_represented_professional_id uuid,
  p_conversation_type text default 'external_inquiry',
  p_external_participant_id uuid default null,
  p_origin text default 'painel',
  p_origin_reference text default null,
  p_channel text default null,
  p_initial_mandate text default 'active',
  p_initial_state text default 'novo',
  p_transferred_from_conversation_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
begin
  if not public.is_system_caller() and auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

  insert into public.conversations (
    represented_professional_id, conversation_type, external_participant_id,
    origin, origin_reference, channel,
    mandate, mandate_created_at,
    current_state, previous_state, state_updated_at,
    transferred_from_conversation_id
  ) values (
    p_represented_professional_id, p_conversation_type, p_external_participant_id,
    p_origin, p_origin_reference, coalesce(p_channel, p_origin),
    p_initial_mandate, now(),
    p_initial_state, null, now(),
    p_transferred_from_conversation_id
  )
  returning * into v_conversation;

  return v_conversation;
end;
$$;

comment on function public.create_conversation is 'Bloco de conversação (0039) — estendido pelo Orchestrator/Runtime (0051) com um caller de sistema (is_system_caller()), condição ADICIONAL ao auth.uid() já existente, nunca substituindo. p_represented_professional_id continua o único parâmetro que decide o dono — quando chamado por sistema, a responsabilidade de essa identidade estar correta é do Orchestrator (resolução de canal→profissional), nunca provada criptograficamente aqui (não há sessão de usuário nesse caminho).';

grant execute on function public.create_conversation to service_role;

-- try_acquire_approval_resolution_claim / reserve_approval_dispatch_token /
-- commit_approval_resolution / release_approval_resolution_claim /
-- record_resolution_overflow / get_resolution_backoff_status (Bloco 5)
-- e is_commercial_root_terminal / record_policy_gate_decision (Bloco 6):
-- todas já derivam v_professional_id de dados estruturais (conversation_messages
-- -> conversations.represented_professional_id, ou de commercial_root_belongs_to_professional),
-- nunca de um parâmetro solto — a condição de sistema aqui é só
-- "pular a comparação final contra auth.uid()", nunca pular a
-- derivação em si.

create or replace function public.try_acquire_approval_resolution_claim(
  p_message_id uuid,
  p_worker_id text,
  p_current_context_identity bytea,
  p_lease_seconds integer default 120,
  p_base_backoff_seconds double precision default 60.0,
  p_max_backoff_seconds double precision default 3600.0
)
returns table (granted boolean, lease_token uuid, lease_expires_at timestamptz, deny_reason text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_author_type text;
  v_backoff public.approval_resolution_backoff;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if octet_length(p_current_context_identity) <> 32 then
    raise exception 'invalid_context_identity' using errcode = '22023';
  end if;

  select c.represented_professional_id, cm.author_type into v_professional_id, v_author_type
  from public.conversation_messages cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_author_type <> 'professional' then
    raise exception 'message_not_professional_statement' using errcode = '22023';
  end if;

  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and outcome = 'resolved') then
    return query select false, null::uuid, null::timestamptz, 'already_resolved';
    return;
  end if;

  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and context_identity = p_current_context_identity) then
    return query select false, null::uuid, null::timestamptz, 'already_pinned_for_context';
    return;
  end if;

  insert into public.approval_resolution_backoff (professional_statement_message_id)
  values (p_message_id)
  on conflict (professional_statement_message_id) do nothing;

  select * into v_backoff from public.approval_resolution_backoff where professional_statement_message_id = p_message_id for update;

  if v_backoff.next_eligible_reason = 'overflow' and now() < v_backoff.next_eligible_at then
    return query select false, null::uuid, null::timestamptz, 'backoff';
    return;
  end if;

  if v_backoff.last_context_identity is not null
     and v_backoff.last_context_identity = p_current_context_identity
     and now() < v_backoff.next_eligible_at then
    return query select false, null::uuid, null::timestamptz, 'backoff';
    return;
  end if;

  v_lease_token := gen_random_uuid();
  v_lease_expires_at := now() + make_interval(secs => p_lease_seconds);

  insert into public.approval_resolution_claims (professional_statement_message_id, claimed_by, lease_token, lease_expires_at)
  values (p_message_id, p_worker_id, v_lease_token, v_lease_expires_at)
  on conflict (professional_statement_message_id) do update
    set claimed_by = excluded.claimed_by, lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at, claimed_at = now()
  where public.approval_resolution_claims.lease_expires_at < now();

  if not found then
    return query select false, null::uuid, null::timestamptz, 'claim_held_by_another_worker';
    return;
  end if;

  return query select true, v_lease_token, v_lease_expires_at, null::text;
end;
$$;

grant execute on function public.try_acquire_approval_resolution_claim to service_role;

create or replace function public.reserve_approval_dispatch_token(
  p_message_id uuid,
  p_lease_token uuid,
  p_rate_capacity double precision default 5.0,
  p_rate_refill_period_seconds double precision default 300.0
)
returns table (reserved boolean, deny_reason text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.approval_resolution_claims;
  v_professional_id uuid;
  v_backoff public.approval_resolution_backoff;
  v_elapsed double precision;
  v_new_tokens double precision;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_claim from public.approval_resolution_claims where professional_statement_message_id = p_message_id;
  if v_claim.professional_statement_message_id is null
     or v_claim.lease_token is distinct from p_lease_token
     or v_claim.lease_expires_at < now() then
    return query select false, 'lease_invalid_or_expired';
    return;
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_backoff from public.approval_resolution_backoff where professional_statement_message_id = p_message_id for update;
  v_elapsed := extract(epoch from (now() - v_backoff.rate_last_refill_at));
  v_new_tokens := least(p_rate_capacity, v_backoff.rate_tokens + v_elapsed * (p_rate_capacity / p_rate_refill_period_seconds));

  if v_new_tokens < 1.0 then
    update public.approval_resolution_backoff set rate_tokens = v_new_tokens, rate_last_refill_at = now() where professional_statement_message_id = p_message_id;
    return query select false, 'rate_limited';
    return;
  end if;

  update public.approval_resolution_backoff
  set rate_tokens = v_new_tokens - 1.0, rate_last_refill_at = now()
  where professional_statement_message_id = p_message_id;

  return query select true, null::text;
end;
$$;

grant execute on function public.reserve_approval_dispatch_token to service_role;

drop function if exists public.release_approval_resolution_claim(uuid, uuid);

create function public.release_approval_resolution_claim(p_message_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.approval_resolution_claims
  where professional_statement_message_id = p_message_id and lease_token = p_lease_token;

  return found;
end;
$$;

grant execute on function public.release_approval_resolution_claim to service_role;

create or replace function public.commit_approval_resolution(
  p_message_id uuid,
  p_lease_token uuid,
  p_commercial_root_id uuid,
  p_inference_context_identity bytea,
  p_current_context_identity bytea,
  p_context_schema_version text,
  p_outcome text,
  p_inconclusive_reason text,
  p_decisions jsonb
)
returns table (committed boolean, discard_reason text, approval_resolution_id uuid, approval_record_ids uuid[])
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.approval_resolution_claims;
  v_professional_id uuid;
  v_author_type text;
  v_decision jsonb;
  v_new_ids uuid[] := '{}';
  v_new_id uuid;
  v_lock_key bigint;
  v_next_version integer;
  v_resolution_id uuid;
  v_sorted_decisions jsonb;
  v_op text;
  v_ref_ids uuid[];
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_outcome not in ('resolved', 'inconclusive') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  select * into v_claim from public.approval_resolution_claims where professional_statement_message_id = p_message_id;

  if v_claim.professional_statement_message_id is null
     or v_claim.lease_token is distinct from p_lease_token
     or v_claim.lease_expires_at < now() then
    return query select false, 'lease_invalid_or_expired', null::uuid, null::uuid[];
    return;
  end if;

  select c.represented_professional_id, cm.author_type into v_professional_id, v_author_type
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_author_type <> 'professional' then
    raise exception 'message_not_professional_statement' using errcode = '22023';
  end if;

  if not public.commercial_root_belongs_to_professional(p_commercial_root_id, v_professional_id) then
    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select false, 'invalid_provenance', null::uuid, null::uuid[];
    return;
  end if;

  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and outcome = 'resolved') then
    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select false, 'already_resolved', null::uuid, null::uuid[];
    return;
  end if;

  if p_inference_context_identity is distinct from p_current_context_identity then
    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select false, 'stale_context_discarded', null::uuid, null::uuid[];
    return;
  end if;

  if p_outcome = 'inconclusive' then
    insert into public.approval_resolutions (
      professional_statement_message_id, professional_id, commercial_root_id,
      context_identity, context_schema_version, outcome, inconclusive_reason, resolved_approval_record_ids
    ) values (
      p_message_id, v_professional_id, p_commercial_root_id,
      p_current_context_identity, p_context_schema_version, 'inconclusive', p_inconclusive_reason, '{}'
    )
    returning id into v_resolution_id;

    update public.approval_resolution_backoff
    set attempt_count = case when last_context_identity = p_current_context_identity then attempt_count + 1 else 1 end,
        last_context_identity = p_current_context_identity,
        next_eligible_at = now() + make_interval(secs => least(3600.0, 60.0 * power(2, (case when last_context_identity = p_current_context_identity then attempt_count else 0 end)))),
        next_eligible_reason = 'resolution_attempt',
        updated_at = now()
    where professional_statement_message_id = p_message_id;

    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select true, null::text, v_resolution_id, '{}'::uuid[];
    return;
  end if;

  for v_decision in select * from jsonb_array_elements(p_decisions)
  loop
    if (v_decision->>'commercialRootId')::uuid is distinct from p_commercial_root_id then
      delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
      return query select false, 'invalid_provenance', null::uuid, null::uuid[];
      return;
    end if;

    v_op := v_decision->>'operationType';
    v_ref_ids := coalesce(
      (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_decision->'communicatedProposalMessageIds', '[]'::jsonb)) x),
      '{}'
    );
    if (v_op in ('contextual_decision', 'explicit_decision', 'counterproposal')) <> (cardinality(v_ref_ids) > 0) then
      delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
      return query select false, 'invalid_provenance', null::uuid, null::uuid[];
      return;
    end if;

    if cardinality(v_ref_ids) > 0 then
      if exists (
        select 1 from unnest(v_ref_ids) as ref_id
        where not exists (
          select 1 from public.communicated_proposal_candidates cpc
          where cpc.source_message_id = ref_id
            and cpc.professional_id = v_professional_id
            and cpc.commercial_root_id = p_commercial_root_id
            and cpc.decision_category = v_decision->>'decisionCategory'
            and cpc.subject_key = v_decision->>'subjectKey'
            and cpc.status in ('open', 'possibly_superseded')
        )
      ) then
        delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
        return query select false, 'invalid_provenance', null::uuid, null::uuid[];
        return;
      end if;
    end if;
  end loop;

  select jsonb_agg(d order by (d->>'commercialRootId'), (d->>'decisionCategory'), (d->>'subjectKey'))
  into v_sorted_decisions
  from jsonb_array_elements(p_decisions) d;

  for v_decision in select * from jsonb_array_elements(v_sorted_decisions)
  loop
    v_lock_key := hashtextextended(
      (v_decision->>'commercialRootId') || '|' || (v_decision->>'decisionCategory') || '|' || (v_decision->>'subjectKey'),
      42
    );
    perform pg_advisory_xact_lock(v_lock_key);

    select coalesce(max(version), 0) + 1 into v_next_version
    from public.approval_records
    where professional_id = v_professional_id
      and commercial_root_id = (v_decision->>'commercialRootId')::uuid
      and decision_category = v_decision->>'decisionCategory'
      and subject_key = v_decision->>'subjectKey';

    insert into public.approval_records (
      professional_id, commercial_root_id, decision_category, subject_key, version, operation_type,
      approved_value, professional_statement_message_id, communicated_proposal_message_ids, referred_value
    ) values (
      v_professional_id,
      (v_decision->>'commercialRootId')::uuid,
      v_decision->>'decisionCategory',
      v_decision->>'subjectKey',
      v_next_version,
      v_decision->>'operationType',
      v_decision->'approvedValue',
      p_message_id,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(v_decision->'communicatedProposalMessageIds', '[]'::jsonb)) x), '{}'),
      v_decision->'referredValue'
    )
    returning id into v_new_id;

    v_new_ids := v_new_ids || v_new_id;
  end loop;

  insert into public.approval_resolutions (
    professional_statement_message_id, professional_id, commercial_root_id,
    context_identity, context_schema_version, outcome, inconclusive_reason, resolved_approval_record_ids
  ) values (
    p_message_id, v_professional_id, p_commercial_root_id,
    p_current_context_identity, p_context_schema_version, 'resolved', null, v_new_ids
  )
  returning id into v_resolution_id;

  delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;

  return query select true, null::text, v_resolution_id, v_new_ids;
end;
$$;

grant execute on function public.commit_approval_resolution to service_role;

create or replace function public.record_resolution_overflow(
  p_message_id uuid,
  p_commercial_root_id uuid,
  p_reason text,
  p_decision_category text default null,
  p_subject_key text default null,
  p_magnitude integer default null,
  p_base_backoff_seconds double precision default 60.0,
  p_max_backoff_seconds double precision default 3600.0
)
returns public.approval_resolution_backoff
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_row public.approval_resolution_backoff;
  v_next_attempt integer;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason not in ('context_budget_exceeded', 'chain_candidate_overflow') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.approval_resolution_backoff (professional_statement_message_id, professional_id)
  values (p_message_id, v_professional_id)
  on conflict (professional_statement_message_id) do nothing;

  select attempt_count into v_next_attempt from public.approval_resolution_backoff where professional_statement_message_id = p_message_id for update;
  v_next_attempt := coalesce(v_next_attempt, 0) + 1;

  update public.approval_resolution_backoff
  set professional_id = v_professional_id,
      last_commercial_root_id = p_commercial_root_id,
      last_overflow_reason = p_reason,
      last_overflow_decision_category = p_decision_category,
      last_overflow_subject_key = p_subject_key,
      last_overflow_magnitude = p_magnitude,
      last_overflow_at = now(),
      attempt_count = v_next_attempt,
      next_eligible_at = now() + make_interval(secs => least(p_max_backoff_seconds, p_base_backoff_seconds * power(2, v_next_attempt - 1))),
      next_eligible_reason = 'overflow',
      updated_at = now()
  where professional_statement_message_id = p_message_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.record_resolution_overflow to service_role;

create or replace function public.get_resolution_backoff_status(p_message_id uuid)
returns table (next_eligible_at timestamptz, last_overflow_reason text, last_overflow_at timestamptz, attempt_count integer)
language sql
security definer set search_path = public
stable
as $$
  select b.next_eligible_at, b.last_overflow_reason, b.last_overflow_at, b.attempt_count
  from public.approval_resolution_backoff b
  join public.conversation_messages cm on cm.id = b.professional_statement_message_id
  join public.conversations c on c.id = cm.conversation_id
  where b.professional_statement_message_id = p_message_id
    and (c.represented_professional_id = auth.uid() or public.is_system_caller());
$$;

grant execute on function public.get_resolution_backoff_status to service_role;

drop function if exists public.is_commercial_root_terminal(uuid);

create function public.is_commercial_root_terminal(p_commercial_root_id uuid, p_professional_id uuid default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
begin
  if public.is_system_caller() then
    if p_professional_id is null then
      raise exception 'professional_id_required_for_system_caller' using errcode = '22023';
    end if;
    v_professional_id := p_professional_id;
  else
    if auth.uid() is null then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    v_professional_id := auth.uid();
  end if;

  if not public.commercial_root_belongs_to_professional(p_commercial_root_id, v_professional_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return exists (
    select 1 from public.bookings where id = p_commercial_root_id and status in ('recusada', 'cancelada')
  ) or exists (
    select 1 from public.opportunities where id = p_commercial_root_id and status = 'cancelada'
  );
end;
$$;

comment on function public.is_commercial_root_terminal is 'Post-model Policy Gate (0049) — estendida pelo Orchestrator/Runtime (0051) com p_professional_id opcional pro caminho de sistema (service_role não tem auth.uid()). Caller comum continua exatamente igual (p_professional_id ignorado, auth.uid() é quem prova identidade). commercial_root_belongs_to_professional continua a única fonte de verdade de ownership nos dois caminhos — sistema nunca pula essa checagem, só troca de onde o professional_id vem.';

grant execute on function public.is_commercial_root_terminal to service_role;

create or replace function public.record_policy_gate_decision(
  p_conversation_id uuid,
  p_commercial_root_id uuid,
  p_message_id uuid,
  p_run_id uuid,
  p_outcome text,
  p_policy_version text,
  p_primary_block_reason text,
  p_checks jsonb
)
returns public.policy_gate_decisions
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_row public.policy_gate_decisions;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select represented_professional_id into v_professional_id
  from public.conversations where id = p_conversation_id;

  if v_professional_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not v_is_system and auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.commercial_root_belongs_to_professional(p_commercial_root_id, v_professional_id) then
    raise exception 'invalid_provenance' using errcode = '22023';
  end if;

  if p_outcome not in ('allowed', 'blocked') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  insert into public.policy_gate_decisions (
    professional_id, conversation_id, commercial_root_id, message_id, run_id,
    outcome, policy_version, primary_block_reason, checks
  ) values (
    v_professional_id, p_conversation_id, p_commercial_root_id, p_message_id, p_run_id,
    p_outcome, p_policy_version, p_primary_block_reason, coalesce(p_checks, '[]'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.record_policy_gate_decision to service_role;

-- ============================================================
-- 4. professional_not_operationally_ready — novo motivo de bloqueio
--    do Post-model Gate. Fronteira final (decisão do usuário):
--    checado SÓ quando o extrator já encontrou pelo menos um
--    ExtractedCommitment (intake/discovery sem compromisso concreto
--    nunca aciona isso) e o destinatário é external_participant.
--    Nunca baseado em conversation ter opportunity/booking, nunca em
--    requiresProfessionalDecision — reusa só o que o extrator (Bloco
--    6) já calcula.
-- ============================================================
alter table public.policy_gate_decisions drop constraint policy_gate_decisions_primary_block_reason_check;

alter table public.policy_gate_decisions add constraint policy_gate_decisions_primary_block_reason_check
  check (primary_block_reason in (
    'no_matching_approval', 'value_mismatch', 'subject_key_unresolved',
    'commercial_root_terminal', 'invalid_extracted_value', 'extraction_unavailable',
    'stale_dependency', 'professional_not_operationally_ready'
  ));

-- ============================================================
-- 5. ensure_opportunity_for_conversation — linking conversation↔
--    commercial root. Decisão do usuário: NUNCA baseado em
--    commitmentNature (Bloco 4) — só em intent classificado (Bloco
--    3), estruturalmente disponível bem antes de qualquer draft
--    existir. Deliberadamente NÃO reusa/refatora submit_orcamento_request
--    (RPC do /orcamento/[slug], mantido intocado por instrução
--    explícita de rodadas anteriores) — cria pela mesma tabela, um
--    source próprio ('conversation'), nunca duplicando a lógica de
--    roteamento de booker daquele fluxo (que é específica do link
--    público).
-- ============================================================
alter table public.opportunities drop constraint opportunities_source_check;
alter table public.opportunities add constraint opportunities_source_check
  check (source in ('mural', 'artist_link', 'conversation'));

create function public.ensure_opportunity_for_conversation(
  p_conversation_id uuid,
  p_primary_intent text,
  p_classification_status text
)
returns table (opportunity_id uuid, created boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_terminal boolean;
  v_new_id uuid;
  v_client_name text;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if not v_is_system and auth.uid() is distinct from v_conv.represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Root já vinculado — só reusa se não-terminal. Terminal -> substitui
  -- (nunca reabre o antigo, histórico continua intacto e alcançável).
  if v_conv.related_booking_id is not null or v_conv.related_opportunity_id is not null then
    v_terminal := false;
    if v_conv.related_booking_id is not null then
      select (exists (select 1 from public.bookings where id = v_conv.related_booking_id and status in ('recusada', 'cancelada'))) into v_terminal;
    elsif v_conv.related_opportunity_id is not null then
      select (exists (select 1 from public.opportunities where id = v_conv.related_opportunity_id and status = 'cancelada')) into v_terminal;
    end if;

    if not v_terminal then
      return query select coalesce(v_conv.related_opportunity_id, v_conv.related_booking_id), false;
      return;
    end if;
  end if;

  -- Sinal estrutural único: intent classificado (Bloco 3), nunca
  -- commitmentNature (Bloco 4) — decisão explícita do usuário.
  if p_classification_status <> 'classified' or p_primary_intent not in ('orcamento', 'disponibilidade') then
    return query select null::uuid, false;
    return;
  end if;

  select name into v_client_name from public.external_participants where id = v_conv.external_participant_id;

  insert into public.opportunities (artist_profile_id, description, commission_percent, source, client_name)
  values (
    v_conv.represented_professional_id,
    'Contato iniciado via conversa (Intelligence Core)',
    null,
    'conversation',
    v_client_name
  )
  returning id into v_new_id;

  update public.conversations set related_opportunity_id = v_new_id, related_booking_id = null where id = p_conversation_id;

  return query select v_new_id, true;
end;
$$;

comment on function public.ensure_opportunity_for_conversation is 'Orchestrator/Runtime — idempotente (trava a conversation, nunca duplica), chamada logo após o Intent Classifier (Bloco 3). Nunca usa commitmentNature/requiresProfessionalDecision (Bloco 4) como sinal — opportunity pode nascer antes de qualquer compromisso. Root terminal nunca é reaberto: substitui o ponteiro, preserva o histórico.';

revoke all on function public.ensure_opportunity_for_conversation from public;
grant execute on function public.ensure_opportunity_for_conversation to authenticated, service_role;
revoke execute on function public.ensure_opportunity_for_conversation from anon;

-- ============================================================
-- 6. resolve_or_create_external_participant + persist_inbound_message
--    — os dois passos que faltavam pra uma mensagem de CLIENTE
--    (nunca teve sessão Supabase) conseguir entrar no banco. A RLS de
--    conversation_messages (0039) só permite insert de mensagem
--    PRÓPRIA do profissional, de propósito ("participante externo
--    chega por um caminho de intake dedicado, fora daquela
--    migration" — comentário original da 0039). Este é esse caminho.
-- ============================================================
create function public.resolve_or_create_external_participant(
  p_professional_id uuid,
  p_channel text,
  p_identifier text,
  p_name text default null
)
returns public.external_participants
language plpgsql
security definer set search_path = public
as $$
declare
  v_participant public.external_participants;
  v_identity public.external_participant_channel_identities;
begin
  if not public.is_system_caller() and auth.uid() is distinct from p_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select ep.* into v_participant
  from public.external_participant_channel_identities eci
  join public.external_participants ep on ep.id = eci.external_participant_id
  where eci.professional_id = p_professional_id and eci.channel = p_channel and eci.identifier = p_identifier;

  if found then
    if p_name is not null and v_participant.name is null then
      update public.external_participants set name = p_name, updated_at = now() where id = v_participant.id
      returning * into v_participant;
    end if;
    return v_participant;
  end if;

  insert into public.external_participants (professional_id, name)
  values (p_professional_id, p_name)
  returning * into v_participant;

  insert into public.external_participant_channel_identities (external_participant_id, professional_id, channel, identifier, linked_via)
  values (v_participant.id, p_professional_id, p_channel, p_identifier, 'first_contact');

  return v_participant;
end;
$$;

comment on function public.resolve_or_create_external_participant is 'Orchestrator/Runtime — determinístico, nunca inferência de IA (mesmo princípio já documentado em external_participant_channel_identities: merge de identidades é sempre por linked_via explícito, nunca probabilístico).';

revoke all on function public.resolve_or_create_external_participant from public;
grant execute on function public.resolve_or_create_external_participant to authenticated, service_role;
revoke execute on function public.resolve_or_create_external_participant from anon;

create function public.persist_inbound_message(
  p_conversation_id uuid,
  p_author_type text,
  p_author_profile_id uuid,
  p_author_external_participant_id uuid,
  p_channel text,
  p_content_type text,
  p_body text
)
returns public.conversation_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_message public.conversation_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_author_type not in ('external_participant', 'professional') then
    raise exception 'invalid_author_type' using errcode = '22023';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- Nunca confia no parâmetro sozinho: author_profile_id (quando
  -- professional) tem que ser o mesmo representado da conversa;
  -- author_external_participant_id (quando external_participant) tem
  -- que ser o mesmo já vinculado à conversa (ou a conversa ainda não
  -- ter nenhum, primeiro contato).
  if p_author_type = 'professional' and p_author_profile_id is distinct from v_conv.represented_professional_id then
    raise exception 'author_mismatch' using errcode = '22023';
  end if;
  if p_author_type = 'external_participant' and v_conv.external_participant_id is not null
     and p_author_external_participant_id is distinct from v_conv.external_participant_id then
    raise exception 'author_mismatch' using errcode = '22023';
  end if;

  if v_conv.external_participant_id is null and p_author_type = 'external_participant' then
    update public.conversations set external_participant_id = p_author_external_participant_id where id = p_conversation_id;
  end if;

  insert into public.conversation_messages (
    conversation_id, direction, author_type, author_profile_id, author_external_participant_id,
    channel, content_type, body, generated_by
  ) values (
    p_conversation_id, 'inbound', p_author_type,
    case when p_author_type = 'professional' then p_author_profile_id else null end,
    case when p_author_type = 'external_participant' then p_author_external_participant_id else null end,
    p_channel, p_content_type, p_body, 'human'
  )
  returning * into v_message;

  update public.conversations set last_activity_at = now() where id = p_conversation_id;

  return v_message;
end;
$$;

comment on function public.persist_inbound_message is 'Orchestrator/Runtime — único caminho de escrita de mensagem inbound de EXTERNAL_PARTICIPANT (a RLS de conversation_messages, 0039, só permite insert direto de mensagem própria do profissional, de propósito). KNOW≠APPROVE nunca em risco aqui: esta function só persiste conteúdo, nunca decide aprovação — author_type continua a única fonte de verdade que o Approval Resolver confia.';

revoke all on function public.persist_inbound_message from public;
grant execute on function public.persist_inbound_message to service_role;
revoke execute on function public.persist_inbound_message from anon, authenticated;

-- ============================================================
-- 7. outbound_intents — decidir o que enviar ≠ enviar de fato.
--    State machine própria, NUNCA dependente de garantia de provider
--    (idempotency-key de provider é só uma trava adicional, nunca a
--    garantia primária — decisão do usuário).
-- ============================================================
create table public.outbound_intents (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete restrict,
  trigger_message_id uuid references public.conversation_messages (id) on delete set null,
  run_id uuid references public.orchestrator_runs (id) on delete set null,
  policy_decision_id uuid references public.policy_gate_decisions (id) on delete set null,

  channel text not null check (channel in ('whatsapp', 'email', 'painel', 'public_link', 'outro')),
  recipient_external_participant_id uuid references public.external_participants (id) on delete restrict,
  content text not null,

  delivery_state text not null default 'policy_allowed' check (delivery_state in (
    'policy_allowed', 'queued', 'sending', 'sent_unknown', 'sent_confirmed',
    'delivered', 'read', 'failed_transient', 'failed_permanent', 'cancelled'
  )),
  send_attempt_id uuid,
  send_lease_expires_at timestamptz,
  provider_message_id text,
  failure_reason text,
  conversation_message_id uuid references public.conversation_messages (id) on delete set null,

  created_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.outbound_intents is 'Orchestrator/Runtime — separa "o que a Doopla decidiu comunicar" (autorizado pelo Post-model Gate, policy_decision_id) de "o cliente recebeu de fato" (delivery_state). conversation_messages (direction=outbound) só nasce quando sent_confirmed — nunca antes, nunca representa um draft que não saiu.';
comment on column public.outbound_intents.delivery_state is 'sent_unknown É TERMINAL PRA AUTOMAÇÃO — nasce quando o provider não confirma nem nega (timeout/conexão caiu). claim_outbound_intent_for_send() nunca reclama um sent_unknown; recuperação exige reconciliação explícita com o provider (quando existir) ou um outbound_intent NOVO, nunca reenvio cego do mesmo.';

create index outbound_intents_conversation_idx on public.outbound_intents (conversation_id, created_at desc);
create index outbound_intents_professional_idx on public.outbound_intents (professional_id, created_at desc);
create index outbound_intents_claimable_idx on public.outbound_intents (delivery_state, send_lease_expires_at)
  where delivery_state in ('queued', 'sending', 'failed_transient');

alter table public.outbound_intents enable row level security;

create policy "outbound_intents: select own" on public.outbound_intents
  for select to authenticated
  using (professional_id = auth.uid());
-- Sem policy de insert/update/delete — só as RPCs abaixo escrevem.

create function public.create_outbound_intent(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_run_id uuid,
  p_policy_decision_id uuid,
  p_channel text,
  p_recipient_external_participant_id uuid,
  p_content text
)
returns public.outbound_intents
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_row public.outbound_intents;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select represented_professional_id into v_professional_id from public.conversations where id = p_conversation_id;
  if v_professional_id is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content
  ) values (
    p_conversation_id, v_professional_id, p_trigger_message_id, p_run_id, p_policy_decision_id,
    p_channel, p_recipient_external_participant_id, p_content
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_outbound_intent from public;
grant execute on function public.create_outbound_intent to service_role;
revoke execute on function public.create_outbound_intent from anon, authenticated;

create function public.claim_outbound_intent_for_send(p_outbound_intent_id uuid, p_worker_id text, p_lease_seconds integer default 60)
returns table (granted boolean, send_attempt_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempt_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_attempt_id := gen_random_uuid();

  update public.outbound_intents
  set delivery_state = 'sending', send_attempt_id = v_attempt_id,
      send_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      queued_at = coalesce(queued_at, now()), updated_at = now()
  where id = p_outbound_intent_id
    and (
      delivery_state in ('policy_allowed', 'queued', 'failed_transient')
      or (delivery_state = 'sending' and send_lease_expires_at < now())
    );

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  return query select true, v_attempt_id;
end;
$$;

comment on function public.claim_outbound_intent_for_send is 'Nunca reclama sent_unknown/sent_confirmed/failed_permanent/cancelled — só policy_allowed/queued/failed_transient (retry legítimo) ou sending com lease vencido (worker travado/crashado). Dois workers nunca vencem a mesma claim (mesmo padrão de approval_resolution_claims).';

revoke all on function public.claim_outbound_intent_for_send from public;
grant execute on function public.claim_outbound_intent_for_send to service_role;
revoke execute on function public.claim_outbound_intent_for_send from anon, authenticated;

create function public.mark_outbound_intent_sent_confirmed(p_outbound_intent_id uuid, p_send_attempt_id uuid, p_provider_message_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.outbound_intents
  set delivery_state = 'sent_confirmed', provider_message_id = p_provider_message_id,
      sent_at = now(), updated_at = now()
  where id = p_outbound_intent_id and delivery_state = 'sending' and send_attempt_id = p_send_attempt_id;

  return found;
end;
$$;

revoke all on function public.mark_outbound_intent_sent_confirmed from public;
grant execute on function public.mark_outbound_intent_sent_confirmed to service_role;
revoke execute on function public.mark_outbound_intent_sent_confirmed from anon, authenticated;

create function public.mark_outbound_intent_send_unknown(p_outbound_intent_id uuid, p_send_attempt_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.outbound_intents
  set delivery_state = 'sent_unknown', updated_at = now()
  where id = p_outbound_intent_id and delivery_state = 'sending' and send_attempt_id = p_send_attempt_id;

  return found;
end;
$$;

comment on function public.mark_outbound_intent_send_unknown is 'Provider não confirmou nem negou (timeout/conexão caiu depois do provider aceitar). Estado terminal pra automação — nunca reclamado por claim_outbound_intent_for_send de novo. Recuperação: reconciliação explícita com o provider (fora desta migration) ou um outbound_intent NOVO, nunca reenvio cego deste.';

revoke all on function public.mark_outbound_intent_send_unknown from public;
grant execute on function public.mark_outbound_intent_send_unknown to service_role;
revoke execute on function public.mark_outbound_intent_send_unknown from anon, authenticated;

create function public.mark_outbound_intent_failed(p_outbound_intent_id uuid, p_send_attempt_id uuid, p_permanent boolean, p_reason text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.outbound_intents
  set delivery_state = case when p_permanent then 'failed_permanent' else 'failed_transient' end,
      failure_reason = p_reason, failed_at = now(), updated_at = now()
  where id = p_outbound_intent_id and delivery_state = 'sending' and send_attempt_id = p_send_attempt_id;

  return found;
end;
$$;

revoke all on function public.mark_outbound_intent_failed from public;
grant execute on function public.mark_outbound_intent_failed to service_role;
revoke execute on function public.mark_outbound_intent_failed from anon, authenticated;

create function public.cancel_outbound_intent(p_outbound_intent_id uuid, p_reason text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.outbound_intents
  set delivery_state = 'cancelled', failure_reason = p_reason, updated_at = now()
  where id = p_outbound_intent_id and delivery_state in ('policy_allowed', 'queued');

  return found;
end;
$$;

revoke all on function public.cancel_outbound_intent from public;
grant execute on function public.cancel_outbound_intent to service_role;
revoke execute on function public.cancel_outbound_intent from anon, authenticated;
