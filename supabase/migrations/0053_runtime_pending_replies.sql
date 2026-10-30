-- Doopla Intelligence Core v1 — fecha o ciclo de decisão do
-- profissional: candidato de proposta inbound com provenance estrita
-- (nunca a partir do "sim"/draft bloqueado), runtime_pending_replies
-- como estado de workflow SEPARADO do audit log (policy_gate_decisions
-- continua append-only, nunca lido como fila), e retomada atômica
-- (outbound_intent + resolução da pendência na MESMA transação — nunca
-- duas chamadas separadas, nunca duplica em crash/retry).
--
-- Autorizado depois de três rodadas de revisão da proposta (ver
-- relatório da conversa). WhatsApp/Meta/Resend continuam fora de
-- escopo. Nenhum merge, nenhum PR.

-- ============================================================
-- 1. try_classify_communicated_proposal — gap encontrado durante a
--    implementação (mesma classe dos gaps de start_orchestrator_run/
--    finish_orchestrator_run na rodada anterior): nunca foi estendida
--    com is_system_caller() — é plpgsql security definer com
--    auth.uid() checado incondicionalmente, ao contrário de
--    get_active_approvals/get_communicated_proposal_candidates (sql
--    stable, sem security definer, protegidas só por RLS na tabela —
--    essas duas já funcionam pra service_role sem mudança nenhuma,
--    confirmado por auditoria, não precisam de extensão). Sem esta
--    extensão o Runtime não conseguiria registrar nenhum candidato de
--    proposta real. Mesma assinatura, só a lógica interna muda —
--    ownership continua sempre derivado estruturalmente
--    (conversation_messages -> conversations), nunca pulado.
-- ============================================================
create or replace function public.try_classify_communicated_proposal(
  p_message_id uuid,
  p_classifier_version text,
  p_commercial_root_id uuid,
  p_outcome text,
  p_decision_category text default null,
  p_subject_key text default null,
  p_proposed_by text default null,
  p_proposed_value jsonb default null,
  p_supersedes_candidate_id uuid default null,
  p_max_candidates_per_chain integer default 50
)
returns table (already_classified boolean, resulting_candidate_id uuid, limit_exceeded boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_new_candidate_id uuid;
  v_lock_key bigint;
  v_open_count integer;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_outcome not in ('not_a_proposal', 'created_candidate', 'reaffirmed_candidate', 'superseded_candidate') then
    raise exception 'invalid_outcome' using errcode = '22023';
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

  if exists (select 1 from public.communicated_proposal_classifications where message_id = p_message_id) then
    select cpc.resulting_candidate_id into v_new_candidate_id from public.communicated_proposal_classifications cpc where cpc.message_id = p_message_id;
    return query select true, v_new_candidate_id, false;
    return;
  end if;

  if p_outcome = 'not_a_proposal' then
    insert into public.communicated_proposal_classifications (message_id, professional_id, commercial_root_id, classifier_version, outcome, resulting_candidate_id)
    values (p_message_id, v_professional_id, p_commercial_root_id, p_classifier_version, p_outcome, null);
    return query select false, null::uuid, false;
    return;
  end if;

  v_lock_key := hashtextextended(
    v_professional_id::text || '|' || p_commercial_root_id::text || '|' || coalesce(p_decision_category, '') || '|' || coalesce(p_subject_key, ''),
    43
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) into v_open_count
  from public.communicated_proposal_candidates
  where professional_id = v_professional_id
    and commercial_root_id = p_commercial_root_id
    and decision_category = p_decision_category
    and subject_key = p_subject_key
    and status in ('open', 'possibly_superseded');

  if v_open_count >= p_max_candidates_per_chain then
    raise warning 'candidate_limit_exceeded professional_id=% commercial_root_id=% decision_category=% subject_key=% open_count=% max=%',
      v_professional_id, p_commercial_root_id, p_decision_category, p_subject_key, v_open_count, p_max_candidates_per_chain;
    return query select false, null::uuid, true;
    return;
  end if;

  if p_outcome = 'superseded_candidate' then
    if p_supersedes_candidate_id is null then
      raise exception 'supersedes_candidate_id_required' using errcode = '22023';
    end if;
    update public.communicated_proposal_candidates
    set status = 'possibly_superseded'
    where id = p_supersedes_candidate_id and status = 'open';
  end if;

  insert into public.communicated_proposal_candidates (
    professional_id, commercial_root_id, decision_category, subject_key, proposed_by,
    source_message_id, proposed_value, classifier_version, believed_superseded_by_candidate_id
  ) values (
    v_professional_id, p_commercial_root_id, p_decision_category, p_subject_key, p_proposed_by,
    p_message_id, p_proposed_value, p_classifier_version, null
  )
  returning id into v_new_candidate_id;

  if p_outcome = 'superseded_candidate' and p_supersedes_candidate_id is not null then
    update public.communicated_proposal_candidates set believed_superseded_by_candidate_id = v_new_candidate_id where id = p_supersedes_candidate_id;
  end if;

  insert into public.communicated_proposal_classifications (message_id, professional_id, commercial_root_id, classifier_version, outcome, resulting_candidate_id)
  values (p_message_id, v_professional_id, p_commercial_root_id, p_classifier_version, p_outcome, v_new_candidate_id);

  return query select false, v_new_candidate_id, false;
end;
$$;

comment on function public.try_classify_communicated_proposal is 'Bloco 5 — classificação incremental pin-once. Estendida (0053) com is_system_caller() — condição ADICIONAL a auth.uid(), nunca substituindo; ownership continua sempre derivado de conversation_messages->conversations, nunca de um parâmetro solto. Chamador real agora existe: src/lib/intelligence/inbound-proposal (Runtime), com provenance estrita — só chama isto quando o valor está literalmente na mensagem-fonte, nunca inferido de contexto.';

grant execute on function public.try_classify_communicated_proposal to service_role;

-- ============================================================
-- 2. runtime_pending_replies — estado de workflow SEPARADO do audit
--    log. policy_gate_decisions continua append-only, nunca alterado,
--    nunca inferido como fila (decisão do usuário, explícita: "não
--    quero policy_gate_decisions funcionando como fila/estado
--    operacional"). Cada linha aqui é uma fotografia imutável de UM
--    policy_gate_decision específico — nunca reaproveitada pra
--    representar uma avaliação diferente (lifecycle por snapshots
--    sucessivos, decisão do usuário).
-- ============================================================
create table public.runtime_pending_replies (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Nunca fk pra bookings/opportunities diretamente — mesmo padrão de
  -- approval_records/policy_gate_decisions (commercial_root_id é um
  -- dos dois, resolve_commercial_root_id é a única fonte de verdade).
  commercial_root_id uuid not null,
  trigger_message_id uuid not null references public.conversation_messages (id) on delete restrict,
  policy_gate_decision_id uuid not null references public.policy_gate_decisions (id) on delete restrict,
  run_id uuid references public.orchestrator_runs (id) on delete set null,

  status text not null default 'pending' check (status in ('pending', 'completed', 'superseded')),
  -- Só preenchido quando status='superseded' E existe uma pendência
  -- sucessora real (root virando terminal supersede sem sucessora).
  -- Mesmo padrão de communicated_proposal_candidates.believed_superseded_by_candidate_id.
  superseded_by_id uuid references public.runtime_pending_replies (id),

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  check (superseded_by_id is null or status = 'superseded')
);

comment on table public.runtime_pending_replies is 'Orchestrator/Runtime — obrigação de retomada de UM turno do cliente que ficou bloqueado esperando decisão do profissional. NUNCA duplica approval_records/policy_gate_decisions — só referencia. Cada linha representa a fotografia de UM policy_gate_decision específico; se a retomada continuar bloqueada, esta linha vira superseded e uma NOVA linha (referenciando o NOVO policy_gate_decision) representa a obrigação atual — nunca a mesma linha muda de qual avaliação do Gate ela representa.';
comment on column public.runtime_pending_replies.status is 'pending: obrigação viva, aguardando. completed: Gate re-avaliado permitiu, outbound_intent criado (ou terminal-de-sucesso). superseded: nunca mais será retomada por esta linha — ou porque uma pendência mais nova a substituiu (superseded_by_id preenchido), ou porque a raiz comercial ficou terminal (superseded_by_id nulo).';

create index runtime_pending_replies_commercial_root_idx
  on public.runtime_pending_replies (commercial_root_id, status);
create index runtime_pending_replies_conversation_idx
  on public.runtime_pending_replies (conversation_id, created_at);

alter table public.runtime_pending_replies enable row level security;
-- Sem policy pra authenticated/anon — estado interno do Orchestrator,
-- mesmo padrão de inbound_events/conversation_processing_leases.
-- service_role bypassa RLS.

-- ============================================================
-- 3. create_runtime_pending_reply — supersede-then-insert atômico.
--    Recebe do chamador (TS, matching puro já calculado) a lista de
--    pendências ANTIGAS que devem ser superseded por esta nova —
--    nunca decide matching aqui, só executa atomicamente.
-- ============================================================
create function public.create_runtime_pending_reply(
  p_conversation_id uuid,
  p_commercial_root_id uuid,
  p_trigger_message_id uuid,
  p_policy_gate_decision_id uuid,
  p_run_id uuid,
  p_supersede_ids uuid[] default '{}'
)
returns public.runtime_pending_replies
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.runtime_pending_replies;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.runtime_pending_replies (
    conversation_id, commercial_root_id, trigger_message_id, policy_gate_decision_id, run_id
  ) values (
    p_conversation_id, p_commercial_root_id, p_trigger_message_id, p_policy_gate_decision_id, p_run_id
  )
  returning * into v_row;

  if array_length(p_supersede_ids, 1) > 0 then
    update public.runtime_pending_replies
    set status = 'superseded', superseded_by_id = v_row.id, resolved_at = now()
    where id = any(p_supersede_ids) and status = 'pending' and commercial_root_id = p_commercial_root_id;
  end if;

  return v_row;
end;
$$;

comment on function public.create_runtime_pending_reply is 'Orchestrator/Runtime — cria uma pendência nova e, na MESMA transação, supersede as antigas indicadas pelo chamador (matching de decision_category/subject_key já calculado em TS, 100% puro/testável — esta function só executa, nunca decide). p_supersede_ids sempre filtrado por commercial_root_id e status=pending aqui dentro — nunca supersede algo fora da mesma raiz nem já resolvido.';

revoke all on function public.create_runtime_pending_reply from public;
grant execute on function public.create_runtime_pending_reply to service_role;
revoke execute on function public.create_runtime_pending_reply from anon, authenticated;

-- ============================================================
-- 4. list_pending_runtime_replies — leitura. Matching preciso
--    (decision_category+subject_key, exclusão de subject_key_unresolved)
--    fica em TS contra policy_gate_decisions.checks lido separadamente
--    (service_role já lê policy_gate_decisions diretamente, RLS não
--    aplica — sem necessidade de RPC nova só pra isso).
-- ============================================================
create function public.list_pending_runtime_replies(p_commercial_root_id uuid)
returns setof public.runtime_pending_replies
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query select * from public.runtime_pending_replies
  where commercial_root_id = p_commercial_root_id and status = 'pending'
  order by created_at asc;
end;
$$;

revoke all on function public.list_pending_runtime_replies from public;
grant execute on function public.list_pending_runtime_replies to service_role;
revoke execute on function public.list_pending_runtime_replies from anon, authenticated;

-- ============================================================
-- 5. resolve_runtime_pending_reply_allowed — claim atômico + criação
--    do outbound_intent NA MESMA transação. Retry depois de um crash
--    pós-commit (antes da resposta HTTP chegar no Runtime) encontra
--    status != 'pending' e não faz nada — nunca duplica.
-- ============================================================
create function public.resolve_runtime_pending_reply_allowed(
  p_pending_reply_id uuid,
  p_new_policy_gate_decision_id uuid,
  p_run_id uuid,
  p_channel text default null,
  p_recipient_external_participant_id uuid default null,
  p_content text default null
)
returns table (claimed boolean, outbound_intent_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pending public.runtime_pending_replies;
  v_professional_id uuid;
  v_intent_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.runtime_pending_replies
  set status = 'completed', resolved_at = now()
  where id = p_pending_reply_id and status = 'pending'
  returning * into v_pending;

  if v_pending.id is null then
    -- Já resolvida por uma tentativa anterior (crash pós-commit, ou
    -- concorrência) — no-op idempotente, nunca duplica.
    return query select false, null::uuid;
    return;
  end if;

  -- Caso raro (retomada muda o destinatário pro próprio profissional,
  -- ex.: responsePlan virou consult_professional na reavaliação):
  -- recipient nulo pula o outbound_intent — o chamador usa
  -- persist_ai_message por fora, nunca outbound_intents pro
  -- profissional. O claim (marcar completed) ainda é o boundary de
  -- idempotência real; a mensagem ao profissional nesse caso raro fica
  -- best-effort, não atômica com o claim.
  if p_recipient_external_participant_id is null then
    return query select true, null::uuid;
    return;
  end if;

  select represented_professional_id into v_professional_id
  from public.conversations where id = v_pending.conversation_id;

  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content
  ) values (
    v_pending.conversation_id, v_professional_id, v_pending.trigger_message_id, p_run_id, p_new_policy_gate_decision_id,
    p_channel, p_recipient_external_participant_id, p_content
  )
  returning id into v_intent_id;

  return query select true, v_intent_id;
end;
$$;

comment on function public.resolve_runtime_pending_reply_allowed is 'Orchestrator/Runtime — retomada com sucesso: claim atômico (UPDATE...WHERE status=pending) seguido da criação do outbound_intent, na MESMA transação/function. Boundary de idempotência exigido pelo usuário: um retry depois de crash pós-commit encontra status já != pending e retorna claimed=false sem inserir nada — nunca dois outbound_intents pra mesma retomada. Recipient nulo (caso raro: retomada mudou o destinatário pro profissional) só faz o claim, sem outbound_intent.';

revoke all on function public.resolve_runtime_pending_reply_allowed from public;
grant execute on function public.resolve_runtime_pending_reply_allowed to service_role;
revoke execute on function public.resolve_runtime_pending_reply_allowed from anon, authenticated;

-- ============================================================
-- 6. resolve_runtime_pending_reply_still_blocked — claim atômico +
--    nova pendência (Pending B) referenciando o NOVO
--    policy_gate_decision_id, na mesma transação.
-- ============================================================
create function public.resolve_runtime_pending_reply_still_blocked(
  p_pending_reply_id uuid,
  p_new_policy_gate_decision_id uuid,
  p_run_id uuid
)
returns table (claimed boolean, new_pending_reply_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pending public.runtime_pending_replies;
  v_new_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.runtime_pending_replies
  set status = 'superseded', resolved_at = now()
  where id = p_pending_reply_id and status = 'pending'
  returning * into v_pending;

  if v_pending.id is null then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.runtime_pending_replies (
    conversation_id, commercial_root_id, trigger_message_id, policy_gate_decision_id, run_id
  ) values (
    v_pending.conversation_id, v_pending.commercial_root_id, v_pending.trigger_message_id, p_new_policy_gate_decision_id, p_run_id
  )
  returning id into v_new_id;

  update public.runtime_pending_replies set superseded_by_id = v_new_id where id = p_pending_reply_id;

  return query select true, v_new_id;
end;
$$;

comment on function public.resolve_runtime_pending_reply_still_blocked is 'Orchestrator/Runtime — retomada que ainda bloqueou: A vira superseded, B nasce apontando pro NOVO policy_gate_decision_id (fotografia nova) — nunca reaproveita o policy_gate_decision_id antigo. Mesmo boundary de idempotência de resolve_runtime_pending_reply_allowed.';

revoke all on function public.resolve_runtime_pending_reply_still_blocked from public;
grant execute on function public.resolve_runtime_pending_reply_still_blocked to service_role;
revoke execute on function public.resolve_runtime_pending_reply_still_blocked from anon, authenticated;

-- ============================================================
-- 7. supersede_runtime_pending_replies_for_terminal_root — bulk,
--    sem sucessora. "root terminal pode superseder TODAS as
--    pendências da própria root" (decisão do usuário) — inclusive as
--    subject_key_unresolved (aqui não é auto-match por
--    categoria/subject, é a raiz inteira morrendo).
-- ============================================================
create function public.supersede_runtime_pending_replies_for_terminal_root(p_commercial_root_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.runtime_pending_replies
  set status = 'superseded', resolved_at = now()
  where commercial_root_id = p_commercial_root_id and status = 'pending';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.supersede_runtime_pending_replies_for_terminal_root from public;
grant execute on function public.supersede_runtime_pending_replies_for_terminal_root to service_role;
revoke execute on function public.supersede_runtime_pending_replies_for_terminal_root from anon, authenticated;
