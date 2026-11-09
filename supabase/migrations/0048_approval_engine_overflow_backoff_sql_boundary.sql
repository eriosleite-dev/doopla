-- Doopla Intelligence Core v1 — Bloco 5: fecha o risco residual
-- reportado no fechamento da migration 0047 (decisão do usuário nesta
-- rodada) — o backoff de OVERFLOW (context_budget_exceeded/
-- chain_candidate_overflow) só era respeitado por try_acquire_approval_resolution_claim
-- quando o context_identity da tentativa repetia o último gravado
-- (last_context_identity) — mas record_resolution_overflow() NUNCA
-- grava last_context_identity (overflow não tem context_identity
-- associável, por definição: é exatamente a impossibilidade de montar
-- um ResolutionContext completo). Resultado: uma chamada SQL DIRETA
-- ao boundary, com qualquer context_identity, sempre caía no bypass
-- de "contexto novo" (V3.6) e ignorava o next_eligible_at escrito por
-- overflow — só o orchestrator.ts (que consulta get_resolution_backoff_status
-- ANTES de sequer tentar acquire) fechava isso na prática.
--
-- Decisão do usuário: corrigir no próprio boundary SQL. Overflow é
-- condição OPERACIONAL, separada da identidade semântica de resolução
-- (nunca fabricar um context_identity pra overflow) — então a solução
-- não é "fazer overflow também setar last_context_identity" (isso
-- fabricaria uma identidade falsa), é marcar EXPLICITAMENTE qual foi
-- a ÚLTIMA causa que setou next_eligible_at (resolution_attempt vs
-- overflow) e, quando for overflow, bloquear de forma INCONDICIONAL
-- (nunca bypassa por context_identity novo) até next_eligible_at
-- passar. Backoff de resolução normal (V3.6, bypass em contexto novo)
-- continua com o comportamento exato de antes.

alter table public.approval_resolution_backoff
  add column next_eligible_reason text check (next_eligible_reason in ('resolution_attempt', 'overflow'));

comment on column public.approval_resolution_backoff.next_eligible_reason is 'Qual mecanismo foi o ÚLTIMO a escrever next_eligible_at nesta linha. resolution_attempt (commit_approval_resolution, outcome=inconclusive): backoff normal, com bypass em context_identity novo (V3.6, comportamento inalterado). overflow (record_resolution_overflow): backoff OPERACIONAL, bloqueia try_acquire_approval_resolution_claim de forma INCONDICIONAL até next_eligible_at passar — nunca bypassado por context_identity, porque overflow nunca fabrica uma identidade semântica (last_context_identity permanece intocado nesse caminho).';

-- ============================================================
-- 1. record_resolution_overflow — agora marca next_eligible_reason='overflow'.
-- ============================================================
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
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason not in ('context_budget_exceeded', 'chain_candidate_overflow') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null or auth.uid() is distinct from v_professional_id then
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

comment on function public.record_resolution_overflow is 'Bloco 5 — registra uma condição de overflow (budget/candidate limit) como tentativa operacional, nunca como resolution outcome. Nunca escreve em approval_resolutions — preserva a invariante de que todo outcome persistido tem context_identity real e verificável. Aplica backoff exponencial (mesma fórmula já usada pro resolver) tratando o overflow como uma tentativa que não progrediu. Marca next_eligible_reason=''overflow'' (nunca toca last_context_identity — overflow não tem context_identity real associável) para que try_acquire_approval_resolution_claim bloqueie de forma incondicional, não só quando o orchestrator.ts respeita isso por fora.';

-- ============================================================
-- 2. commit_approval_resolution — branch inconclusive agora marca
--    next_eligible_reason='resolution_attempt' explicitamente (mesmo
--    comportamento de bypass em contexto novo de antes, só explícito
--    agora que a coluna existe). Resto da function idêntico à 0047.
-- ============================================================
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
begin
  if auth.uid() is null then
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

  if auth.uid() is distinct from v_professional_id then
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

comment on function public.commit_approval_resolution is 'Bloco 5 — transação #2, com defesa em profundidade (Red Team, achado 4): revalida commercial_root_id (ownership real) e communicatedProposalMessageIds (candidato real, elegível, da mesma chain) NO PRÓPRIO boundary SQL, nunca confiando em orchestrator.ts/resolver.ts. discard_reason=invalid_provenance é fail-closed — todo o lote é descartado, nada é inferido/corrigido automaticamente. Branch inconclusive marca next_eligible_reason=''resolution_attempt'' no backoff (0048) — bypass em context_identity novo (V3.6) inalterado.';

-- ============================================================
-- 3. try_acquire_approval_resolution_claim — novo gate INCONDICIONAL
--    de backoff de overflow, antes do gate existente (context-gated,
--    inalterado) de backoff de resolução normal.
-- ============================================================
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
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if octet_length(p_current_context_identity) <> 32 then
    raise exception 'invalid_context_identity' using errcode = '22023';
  end if;

  select c.represented_professional_id, cm.author_type into v_professional_id, v_author_type
  from public.conversation_messages cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null or auth.uid() is distinct from v_professional_id then
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

  -- Risco residual fechado (decisão do usuário, migration 0048):
  -- backoff de OVERFLOW é INCONDICIONAL — nunca bypassado por
  -- context_identity novo, porque overflow nunca fabrica uma
  -- identidade semântica real (record_resolution_overflow nunca toca
  -- last_context_identity). Um caller SQL direto não consegue mais
  -- furar esse backoff só variando p_current_context_identity — o
  -- mesmo next_eligible_at que o orchestrator.ts já respeitava (via
  -- get_resolution_backoff_status) agora é reforçado aqui, no próprio
  -- boundary. Checado ANTES do gate de backoff de resolução normal
  -- (que continua com bypass em contexto novo, V3.6, inalterado).
  if v_backoff.next_eligible_reason = 'overflow' and now() < v_backoff.next_eligible_at then
    return query select false, null::uuid, null::timestamptz, 'backoff';
    return;
  end if;

  -- Backoff exponencial de resolução NORMAL: só se aplica se o
  -- contexto é o MESMO já tentado (V3.6, inalterado).
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

comment on function public.try_acquire_approval_resolution_claim is 'Bloco 5 — transação #1 (curta). Só posse (claim) + backoff exponencial (2 mecanismos independentes: overflow, incondicional; resolução normal, bypass em contexto novo, V3.6). NUNCA débito de rate limiter (ver reserve_approval_dispatch_token) — perder a corrida pelo claim não pode custar orçamento.';

revoke all on function public.try_acquire_approval_resolution_claim from public;
grant execute on function public.try_acquire_approval_resolution_claim to authenticated;
revoke execute on function public.try_acquire_approval_resolution_claim from anon;
