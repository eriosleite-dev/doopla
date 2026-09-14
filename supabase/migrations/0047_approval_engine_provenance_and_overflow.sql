-- Doopla Intelligence Core v1 — Bloco 5: correções do Red Team
-- adversarial da implementação (achados 4 e 5 do relatório sobre o
-- commit ac86f26, decisões do usuário nesta rodada).
--
-- Achado 4 — commit_approval_resolution não revalidava commercial_root_id
-- nem communicatedProposalMessageIds contra dado real: um profissional
-- autenticado, dono de sua própria mensagem, conseguia forjar
-- commercial_root_id de outro profissional e provenance inexistente.
-- Corrigido com defesa em profundidade NO PRÓPRIO boundary SQL — nunca
-- confiado só em orchestrator.ts/resolver.ts (TS nunca é suficiente
-- pra este boundary).
--
-- Achado 5 — MAX_CANDIDATES_PER_CHAIN só era checado na LEITURA
-- (resolution-context.ts), nunca no ponto de escrita
-- (try_classify_communicated_proposal). Corrigido com o teto físico
-- no write boundary, sob advisory lock pra ser seguro em concorrência.
--
-- Ponto 3 (context_identity/budget_exceeded) — decisão do usuário:
-- NUNCA persistir um outcome de resolução sem context_identity real
-- (a invariante de approval_resolutions continua intocada). Overflow
-- é condição operacional do resolver, não decisão comercial — vai pra
-- approval_resolution_backoff (já era a camada de "attempts" certa,
-- reaproveitada em vez de criar tabela nova, per instrução explícita
-- de auditar reuso antes) via record_resolution_overflow().

-- ============================================================
-- 0. Correção de documentação — achado 5 apontou que este comentário
--    afirmava algo que o código não fazia.
-- ============================================================
comment on index public.communicated_proposal_candidates_open_idx is 'Suporte de leitura pro teto MAX_CANDIDATES_PER_CHAIN, agora TAMBÉM aplicado fisicamente no ponto de escrita (try_classify_communicated_proposal, sob advisory lock) — não é mais só uma checagem de leitura/montagem de ResolutionContext.';

-- ============================================================
-- 1. commercial_root_belongs_to_professional — helper de ownership
--    reutilizado tanto por commit_approval_resolution quanto por
--    qualquer chamador futuro que precise da mesma checagem.
-- ============================================================
create function public.commercial_root_belongs_to_professional(p_commercial_root_id uuid, p_professional_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.bookings where id = p_commercial_root_id and artist_profile_id = p_professional_id
  ) or exists (
    select 1 from public.opportunities where id = p_commercial_root_id and artist_profile_id = p_professional_id
  );
$$;

comment on function public.commercial_root_belongs_to_professional is 'Bloco 5 — verifica que um commercial_root_id (sempre literalmente um booking.id ou opportunity.id, por construção de resolve_commercial_root_id) pertence de fato ao profissional informado. Usado como defesa em profundidade em commit_approval_resolution — nunca confia que o caller (TS) já validou isso.

LIMITAÇÃO CONHECIDA, não resolvida aqui: não valida que a CONVERSA de onde a mensagem partiu está de fato ligada a este commercial_root_id — conversations.related_booking_id/related_opportunity_id existem no schema (migration 0039) mas não são preenchidos por nenhum caminho de escrita real hoje, então essa ligação não é uma fonte de verdade populada. A checagem aqui garante tenant/ownership (o root pertence ao profissional certo), que é a propriedade que fecha o ataque real demonstrado no Red Team — não garante vínculo estrito conversa↔root, que exigiria wiring fora do escopo do Bloco 5.';

revoke all on function public.commercial_root_belongs_to_professional from public;
grant execute on function public.commercial_root_belongs_to_professional to authenticated;
revoke execute on function public.commercial_root_belongs_to_professional from anon;

-- ============================================================
-- 2. commit_approval_resolution — reescrita com revalidação de
--    provenance completa. Mesma assinatura/retorno da 0045 (CREATE OR
--    REPLACE é seguro aqui).
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

  -- ACHADO 4 (Red Team): commercial_root_id precisa pertencer de fato
  -- ao profissional dono da mensagem — nunca aceito só porque o
  -- caller (TS) diz que sim. Outcome explícito e fail-closed, nunca
  -- uma exceção não tratada — o caller trata isso como qualquer outro
  -- discard_reason.
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
        updated_at = now()
    where professional_statement_message_id = p_message_id;

    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select true, null::text, v_resolution_id, '{}'::uuid[];
    return;
  end if;

  -- ACHADO 4 (Red Team) — validação de provenance de TODO o lote
  -- ANTES de qualquer lock/insert. Tudo-ou-nada: se qualquer decisão
  -- falhar, NENHUMA é escrita (mesmo princípio já usado pra
  -- stale-context, agora estendido pra provenance). Nunca tenta
  -- corrigir por inferência — só aceita ou rejeita o lote inteiro.
  for v_decision in select * from jsonb_array_elements(p_decisions)
  loop
    -- 4a. Toda decisão do lote precisa referenciar o MESMO
    -- commercial_root_id já validado acima — nunca um decision-level
    -- root diferente e não verificado.
    if (v_decision->>'commercialRootId')::uuid is distinct from p_commercial_root_id then
      delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
      return query select false, 'invalid_provenance', null::uuid, null::uuid[];
      return;
    end if;

    -- 4b. Simetria de provenance (mesma regra do CHECK físico da
    -- tabela, revalidada aqui pra dar um discard_reason limpo em vez
    -- de deixar a exceção de constraint estourar sem tratamento).
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

    -- 4c. Cada messageId referenciado precisa corresponder a um
    -- candidato REAL, elegível, da MESMA chain (profissional + root +
    -- categoria + subject), ainda open/possibly_superseded — nunca um
    -- UUID arbitrário, nunca candidato de outro profissional, nunca
    -- candidato de uma chain diferente (o que também barra reuso de
    -- candidato de outra raiz comercial/"outra conversa" no sentido
    -- que importa: raiz comercial diferente).
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

comment on function public.commit_approval_resolution is 'Bloco 5 — transação #2, com defesa em profundidade (Red Team, achado 4): revalida commercial_root_id (ownership real) e communicatedProposalMessageIds (candidato real, elegível, da mesma chain) NO PRÓPRIO boundary SQL, nunca confiando em orchestrator.ts/resolver.ts. discard_reason=invalid_provenance é fail-closed — todo o lote é descartado, nada é inferido/corrigido automaticamente.';

-- ============================================================
-- 3. try_classify_communicated_proposal — MAX_CANDIDATES_PER_CHAIN
--    aplicado no write boundary (achado 5). Assinatura muda (novo
--    parâmetro + novo retorno) — precisa DROP antes.
-- ============================================================
drop function public.try_classify_communicated_proposal(uuid, text, uuid, text, text, text, text, jsonb, uuid);

create function public.try_classify_communicated_proposal(
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
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_outcome not in ('not_a_proposal', 'created_candidate', 'reaffirmed_candidate', 'superseded_candidate') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null or auth.uid() is distinct from v_professional_id then
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

  -- ACHADO 5 (Red Team): teto físico no ponto de escrita, sob
  -- advisory lock por chain (seed distinto do lock de versionamento
  -- de commit_approval_resolution — domínios de lock independentes,
  -- nunca compartilham chave/deadlock entre si).
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
    -- Fail-closed + bounded state: nada inserido, nada apagado,
    -- nenhuma escolha automática de quais candidatos manter. A
    -- classificação desta mensagem NUNCA é pinada aqui (nenhuma linha
    -- em communicated_proposal_classifications) — uma tentativa
    -- futura, depois que a chain encolher (fechamento estrutural via
    -- trigger determinístico), pode reclassificar normalmente.
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

comment on function public.try_classify_communicated_proposal is 'Bloco 5 — classificação incremental pin-once. superseded_candidate SÓ rebaixa o alvo pra possibly_superseded (update), nunca DELETE nem structurally_closed. MAX_CANDIDATES_PER_CHAIN (achado 5, Red Team) aplicado aqui sob advisory lock — nunca insere além do teto, nunca escolhe automaticamente quais candidatos manter, nunca apaga; retorna limit_exceeded=true e não pina a classificação, permitindo reavaliação futura.';

revoke all on function public.try_classify_communicated_proposal from public;
grant execute on function public.try_classify_communicated_proposal to authenticated;
revoke execute on function public.try_classify_communicated_proposal from anon;

-- ============================================================
-- 4. approval_resolution_backoff — extensão pra registrar overflow
--    (context_budget_exceeded / chain_candidate_overflow) como
--    condição OPERACIONAL, nunca como outcome de resolução. Reaproveita
--    a tabela de attempts já existente (não cria tabela nova) —
--    auditado antes: já tinha attempt_count/next_eligible_at/
--    rate_tokens, exatamente a camada que faltava só ganhar campos de
--    diagnóstico.
-- ============================================================
alter table public.approval_resolution_backoff
  add column professional_id uuid references public.profiles (id) on delete cascade,
  add column last_commercial_root_id uuid,
  add column last_overflow_reason text check (last_overflow_reason in ('context_budget_exceeded', 'chain_candidate_overflow')),
  add column last_overflow_decision_category text,
  add column last_overflow_subject_key text,
  add column last_overflow_magnitude integer,
  add column last_overflow_at timestamptz;

comment on column public.approval_resolution_backoff.professional_id is 'Denormalizado só pra observabilidade/diagnóstico direto (evita join em toda consulta de log) — nunca usado pra decisão de autorização, que continua sempre derivada de auth.uid() nas functions.';
comment on column public.approval_resolution_backoff.last_overflow_reason is 'context_budget_exceeded (ResolutionContext não coube no budget) ou chain_candidate_overflow (MAX_CANDIDATES_PER_CHAIN/MAX_ACTIVE_CANDIDATES estourado) — condição OPERACIONAL do resolver, nunca escrita em approval_resolutions (essa tabela nunca perde a garantia de context_identity real).';
comment on column public.approval_resolution_backoff.last_overflow_magnitude is 'Cardinalidade que causou o overflow (ex.: tamanho do messageWindow, contagem de candidatos na chain) — pro diagnóstico de quão longe do limite a situação está.';

create function public.record_resolution_overflow(
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
      updated_at = now()
  where professional_statement_message_id = p_message_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.record_resolution_overflow is 'Bloco 5 — registra uma condição de overflow (budget/candidate limit) como tentativa operacional, nunca como resolution outcome. Nunca escreve em approval_resolutions — preserva a invariante de que todo outcome persistido tem context_identity real e verificável. Aplica backoff exponencial (mesma fórmula já usada pro resolver) tratando o overflow como uma tentativa que não progrediu.';

revoke all on function public.record_resolution_overflow from public;
grant execute on function public.record_resolution_overflow to authenticated;
revoke execute on function public.record_resolution_overflow from anon;

create function public.get_resolution_backoff_status(p_message_id uuid)
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
    and c.represented_professional_id = auth.uid();
$$;

comment on function public.get_resolution_backoff_status is 'Bloco 5 — leitura barata de estado de backoff (inclusive overflow), pro orchestrator consultar ANTES de tentar montar um ResolutionContext de novo — evita reprocessar uma mensagem cronicamente over-budget a cada chamada. Sem linha nenhuma se a mensagem nunca teve claim/tentativa — não é erro, é o estado inicial.';

revoke all on function public.get_resolution_backoff_status from public;
grant execute on function public.get_resolution_backoff_status to authenticated;
revoke execute on function public.get_resolution_backoff_status from anon;

-- ============================================================
-- 5. Defesa em profundidade adicional (lição da migration 0041,
--    reaplicada aqui): a configuração padrão do projeto no Supabase
--    concede EXECUTE a anon/authenticated de forma DIRETA em toda
--    function nova (via "alter default privileges", não via o role
--    PUBLIC) — "revoke all ... from public" (0045) nunca removia essa
--    concessão direta de anon. O comportamento de segurança nunca
--    dependeu disso (toda function já valida auth.uid() como primeira
--    linha), mas a trava documentada como "só authenticated pode nem
--    tentar chamar" não estava de fato em vigor pras functions da
--    0045. Fecha isso agora pras 5 já existentes.
-- ============================================================
revoke execute on function public.resolve_commercial_root_id from anon;
revoke execute on function public.try_acquire_approval_resolution_claim from anon;
revoke execute on function public.reserve_approval_dispatch_token from anon;
revoke execute on function public.release_approval_resolution_claim from anon;
revoke execute on function public.get_active_approvals from anon;
revoke execute on function public.get_communicated_proposal_candidates from anon;
