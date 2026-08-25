-- Doopla Intelligence Core v1 — Bloco 5: Approval Engine.
--
-- Fonte de verdade: SPEC CONSOLIDADA V3.10 (10 rodadas de revisão
-- adversarial, V1→V3.10, todas com "não implemente" até a aprovação
-- final). Este comentário resume as invariantes físicas que a spec
-- exige — cada uma delas está reforçada em pelo menos uma constraint,
-- function ou índice abaixo, nunca só em comentário:
--
-- 1. KNOW ≠ COMMUNICATED ≠ APPROVED ≠ COMMITTED. Este bloco representa
--    só APPROVED — nunca envia nada, nunca executa tool de escrita.
-- 2. Toda decisão exige proveniência: professional_statement_message_id
--    sempre; communicated_proposal_message_ids obrigatório/vazio por
--    operation_type, CHECK simétrico via cardinality() (nunca
--    array_length(), que retorna NULL pra array vazio).
-- 3. Idempotência nunca depende de saída de inferência —
--    approval_resolutions pina o outcome por
--    (professional_statement_message_id, context_identity).
-- 4. Só outcome='resolved' é fisicamente terminal (índice único
--    parcial). inconclusive nunca é eterno.
-- 5. Nenhuma transação fica aberta durante I/O externo — claim/lease
--    efêmero (approval_resolution_claims) separado fisicamente do
--    estado de retry/backoff persistente (approval_resolution_backoff).
-- 6. context_identity (SHA-256, calculado em código — ver
--    src/lib/intelligence/approval/canonicalize.ts, única função,
--    usada antes da inferência e na revalidação pré-commit) é
--    fisicamente distinto do hash de 64 bits usado só pro advisory
--    lock de versionamento (hashtextextended) — nunca confundidos.
-- 7. Inferência probabilística nunca remove um candidato do universo
--    do resolver — só pode rebaixar pra 'possibly_superseded'. Só
--    eventos determinísticos (invalidação estrutural de booking/
--    opportunity, ou uma aprovação real e commitada pra mesma chain)
--    fecham (structurally_closed) um candidato de verdade.
-- 8. commercial_root_id é sempre resolvido pela mesma function
--    (resolve_commercial_root_id) em toda leitura e escrita — nunca
--    aceito pré-resolvido de fora.
--
-- Fora de escopo deste bloco (documentado na spec, não implementado
-- aqui): Post-model Policy Gate, execução de tool de escrita, envio
-- real, rate limiting global de uso de IA (só existe o rate limiter
-- por mensagem, ver approval_resolution_backoff).

-- ============================================================
-- 0. bookings.originated_from_opportunity_id — única alteração a uma
--    tabela pré-existente. A 0007 já descrevia a conversão
--    oportunidade→booking em comentário ("vira um booking de
--    verdade") mas nunca implementou o FK. commercial_root_id depende
--    desta coluna pra não ter dois "roots" divergentes pro mesmo
--    negócio.
-- ============================================================
alter table public.bookings
  add column originated_from_opportunity_id uuid references public.opportunities (id) on delete set null;

comment on column public.bookings.originated_from_opportunity_id is 'Bloco 5 — link real da conversão oportunidade→booking, ausente desde a 0007. Usado por resolve_commercial_root_id() como âncora canônica de identidade comercial. Nunca setado retroativamente por este bloco — precisa ser preenchido no fluxo de conversão (fora deste escopo).';

create index bookings_originated_from_opportunity_idx on public.bookings (originated_from_opportunity_id) where originated_from_opportunity_id is not null;

-- ============================================================
-- 1. resolve_commercial_root_id — função canônica única, usada em
--    toda leitura e escrita. root = booking.originated_from_opportunity_id
--    quando setado, senão o próprio booking, senão a própria
--    oportunidade. Nunca aceita root pré-resolvido de fora.
-- ============================================================
create function public.resolve_commercial_root_id(p_booking_id uuid, p_opportunity_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(
    (select b.originated_from_opportunity_id from public.bookings b where b.id = p_booking_id),
    p_booking_id,
    p_opportunity_id
  );
$$;

comment on function public.resolve_commercial_root_id is 'Bloco 5 — identidade comercial canônica. Única function que resolve commercial_root_id, chamada em toda leitura e escrita deste bloco — nunca um root pré-resolvido é aceito como parâmetro de fora.';

revoke all on function public.resolve_commercial_root_id from public;
grant execute on function public.resolve_commercial_root_id to authenticated;

-- ============================================================
-- 2. approval_records — a chain versionada de decisões
--    efetivamente aprovadas. Append-only, nunca UPDATE/DELETE.
-- ============================================================
create table public.approval_records (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete restrict,
  commercial_root_id uuid not null,
  decision_category text not null,
  subject_key text not null,
  version integer not null check (version > 0),
  operation_type text not null check (operation_type in (
    'contextual_decision', 'explicit_decision', 'counterproposal', 'revocation', 'professional_initiated'
  )),
  approved_value jsonb,
  professional_statement_message_id uuid not null references public.conversation_messages (id) on delete restrict,
  communicated_proposal_message_ids uuid[] not null default '{}',
  referred_value jsonb,
  created_at timestamptz not null default now(),

  -- approved_value é null SE E SOMENTE SE operation_type='revocation'
  -- (revogar é registrar que não há mais valor vigente, não um valor).
  check ((operation_type = 'revocation') = (approved_value is null)),

  -- CHECK simétrico via cardinality() — nunca array_length(), que
  -- retorna NULL (não 0) pra array vazio e passaria silenciosamente
  -- num CHECK baseado em OR. Achado real da V3→V3.1.
  check (
    case operation_type
      when 'contextual_decision' then cardinality(communicated_proposal_message_ids) > 0
      when 'explicit_decision' then cardinality(communicated_proposal_message_ids) > 0
      when 'counterproposal' then cardinality(communicated_proposal_message_ids) > 0
      when 'revocation' then cardinality(communicated_proposal_message_ids) = 0
      when 'professional_initiated' then cardinality(communicated_proposal_message_ids) = 0
      else false
    end
  ),

  unique (professional_id, commercial_root_id, decision_category, subject_key, version)
);

comment on table public.approval_records is 'Bloco 5 — chain versionada de decisões efetivamente APROVADAS (nunca comunicadas/aceitas pela contraparte — isso é COMMITTED, fora deste bloco). Append-only. Escrita exclusiva via commit_approval_resolution().';
comment on column public.approval_records.commercial_root_id is 'Sempre resolve_commercial_root_id() — nunca um valor solto. Heterogêneo por natureza (pode ser id de booking OU de opportunity), por isso sem FK direta a uma única tabela.';
comment on column public.approval_records.communicated_proposal_message_ids is 'Obrigatório e não-vazio pra contextual_decision/explicit_decision/counterproposal; obrigatoriamente vazio pra revocation/professional_initiated — CHECK simétrico abaixo via cardinality().';

create index approval_records_chain_idx on public.approval_records (professional_id, commercial_root_id, decision_category, subject_key, version desc);

-- ============================================================
-- 3. communicated_proposal_candidates — bounded lineage (V3.9/V3.10).
--    Nunca apagado por inferência — supersessão por model só rebaixa
--    pra 'possibly_superseded'. Só invalidação estrutural (trigger
--    abaixo) fecha de verdade.
-- ============================================================
create table public.communicated_proposal_candidates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete restrict,
  commercial_root_id uuid not null,
  decision_category text not null,
  subject_key text not null,
  proposed_by text not null check (proposed_by in ('professional', 'external_participant')),
  source_message_id uuid not null references public.conversation_messages (id) on delete restrict,
  proposed_value jsonb not null,

  status text not null default 'open' check (status in ('open', 'possibly_superseded', 'structurally_closed')),
  believed_superseded_by_candidate_id uuid references public.communicated_proposal_candidates (id),
  structurally_invalidated_at timestamptz,
  structurally_invalidated_reason text,

  classifier_version text not null,
  created_at timestamptz not null default now(),

  check (structurally_invalidated_at is null or status = 'structurally_closed')
);

comment on table public.communicated_proposal_candidates is 'Bloco 5 — rastreamento incremental de propostas comunicadas (V3.9/V3.10). NUNCA autoriza aprovação (não é approval_records). Inferência (classificador incremental) só pode criar linhas e mover open→possibly_superseded — nunca apaga, nunca fecha de verdade. Só structurally_closed (via trigger determinístico) remove um candidato do universo vivo.';
comment on column public.communicated_proposal_candidates.status is 'open/possibly_superseded permanecem visíveis por inteiro ao Resolver (ResolutionContext.communicatedProposalCandidates). structurally_closed é o único estado que sai do conjunto vivo, e só chega lá por evento determinístico (ver triggers close_candidates_on_structural_invalidation e close_candidates_on_real_approval).';

create index communicated_proposal_candidates_open_idx
  on public.communicated_proposal_candidates (professional_id, commercial_root_id, decision_category, subject_key)
  where status in ('open', 'possibly_superseded');

-- Bounded lineage — teto per-chain (V3.10, ponto 3). Aplicado em
-- código (try_classify_communicated_proposal), não como CHECK físico
-- (contagem de linhas não é expressável em CHECK de linha única) —
-- documentado aqui pra rastreabilidade.
comment on index public.communicated_proposal_candidates_open_idx is 'MAX_CANDIDATES_PER_CHAIN (código, não CHECK físico — contagem cruza linhas) limita quantas linhas open/possibly_superseded uma única chain pode acumular antes de context_budget/chain_candidate_overflow.';

-- ============================================================
-- 4. communicated_proposal_classifications — pin-once do classificador
--    incremental, mesma disciplina de approval_resolutions.
-- ============================================================
create table public.communicated_proposal_classifications (
  message_id uuid primary key references public.conversation_messages (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete restrict,
  commercial_root_id uuid not null,
  classifier_version text not null,
  outcome text not null check (outcome in ('not_a_proposal', 'created_candidate', 'reaffirmed_candidate', 'superseded_candidate')),
  resulting_candidate_id uuid references public.communicated_proposal_candidates (id),
  created_at timestamptz not null default now(),

  check ((outcome = 'not_a_proposal') = (resulting_candidate_id is null))
);

comment on table public.communicated_proposal_classifications is 'Bloco 5 — pin-once por message_id: uma mensagem só é classificada uma vez (retry é replay puro). classifier_version nunca reinterpreta retroativamente uma linha já pinada — mudança de model/prompt é sempre uma versão nova, aplicada só a mensagens novas.';

-- ============================================================
-- 5. approval_resolutions — outcome pinado do Resolver principal,
--    chave de idempotência real (V3.1: nunca decision_category/
--    subject_key, que são saída de inferência).
-- ============================================================
create table public.approval_resolutions (
  id uuid primary key default gen_random_uuid(),
  professional_statement_message_id uuid not null references public.conversation_messages (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete restrict,
  commercial_root_id uuid not null,
  context_identity bytea not null,
  context_schema_version text not null,
  outcome text not null check (outcome in ('resolved', 'inconclusive')),
  inconclusive_reason text check (inconclusive_reason in ('model_ambiguous', 'context_budget_exceeded', 'chain_candidate_overflow')),
  resolved_approval_record_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),

  check ((outcome = 'inconclusive') = (inconclusive_reason is not null)),
  check ((outcome = 'resolved') = (cardinality(resolved_approval_record_ids) > 0)),
  check (octet_length(context_identity) = 32),

  unique (professional_statement_message_id, context_identity)
);

comment on table public.approval_resolutions is 'Bloco 5 — outcome pinado por (mensagem, context_identity). Chave de idempotência real: nunca decision_category/subject_key (são saída de inferência, V3.1). context_identity é SHA-256 de 32 bytes, calculado em src/lib/intelligence/approval/canonicalize.ts — física e conceitualmente separado do hash de 64 bits do advisory lock de versionamento.';

-- Terminalidade física: só 'resolved' é fisicamente único-terminal.
-- 'inconclusive' nunca é eterno — reavaliável a qualquer momento que
-- context_identity mude (V3.3, achado 2).
create unique index approval_resolutions_terminal_idx
  on public.approval_resolutions (professional_statement_message_id)
  where outcome = 'resolved';

comment on index public.approval_resolutions_terminal_idx is 'Só outcome=resolved é fisicamente terminal. inconclusive pode ter múltiplas linhas (uma por context_identity distinto tentado) — nunca bloqueado por esta unicidade.';

-- ============================================================
-- 6. approval_resolution_claims — posse EFÊMERA da inferência.
--    Separada fisicamente do backoff (V3.5, achado 1) — apagada/
--    substituída livremente a cada tentativa, nunca carrega estado
--    de retry.
-- ============================================================
create table public.approval_resolution_claims (
  professional_statement_message_id uuid primary key references public.conversation_messages (id) on delete cascade,
  claimed_by text not null,
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  claimed_at timestamptz not null default now()
);

comment on table public.approval_resolution_claims is 'Bloco 5 — posse efêmera de tentativa de inferência. lease_token (aleatório por aquisição) é a proteção ABA (V3.3) — renovar/apagar/commitar sempre exige o token exato, nunca só claimed_by. Nenhum campo de retry/backoff mora aqui (ver approval_resolution_backoff).';

-- ============================================================
-- 7. approval_resolution_backoff — estado PERSISTENTE de retry,
--    sobrevive à liberação do claim (V3.5). Backoff exponencial por
--    context_identity + token bucket (V3.6/V3.7) pro rate limiter,
--    fisicamente independentes.
-- ============================================================
create table public.approval_resolution_backoff (
  professional_statement_message_id uuid primary key references public.conversation_messages (id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_context_identity bytea,
  next_eligible_at timestamptz not null default now(),
  rate_tokens double precision not null default 5.0 check (rate_tokens >= 0),
  rate_last_refill_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.approval_resolution_backoff is 'Bloco 5 — estado persistente de retry. attempt_count/next_eligible_at/last_context_identity: backoff exponencial, só se aplica quando o contexto atual repete o último tentado (bypass automático em contexto novo, V3.6). rate_tokens/rate_last_refill_at: token bucket independente (CAPACITY=5, REFILL_PERIOD=300s), bound formal N(T) <= C + r*T (V3.7), nunca fixed window.';

-- ============================================================
-- 8. Triggers determinísticos de fechamento de candidato (V3.10) —
--    os dois ÚNICOS eventos que podem levar status a
--    'structurally_closed'. Nunca por inferência.
-- ============================================================

-- 8a. Booking/opportunity chega a status terminal negativo -> fecha
--     todos os candidatos abertos daquela raiz comercial.
create function public.close_candidates_on_structural_invalidation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_root uuid;
  v_reason text;
begin
  if tg_table_name = 'bookings' then
    if new.status not in ('recusada', 'cancelada') or old.status = new.status then
      return new;
    end if;
    v_root := public.resolve_commercial_root_id(new.id, null);
    v_reason := 'booking_status_' || new.status;
  elsif tg_table_name = 'opportunities' then
    if new.status <> 'cancelada' or old.status = new.status then
      return new;
    end if;
    v_root := public.resolve_commercial_root_id(null, new.id);
    v_reason := 'opportunity_status_' || new.status;
  else
    return new;
  end if;

  update public.communicated_proposal_candidates
  set status = 'structurally_closed',
      structurally_invalidated_at = now(),
      structurally_invalidated_reason = v_reason
  where commercial_root_id = v_root
    and status in ('open', 'possibly_superseded');

  return new;
end;
$$;

comment on function public.close_candidates_on_structural_invalidation is 'Bloco 5 — único caminho determinístico (fato de coluna, sem inferência) de fechamento de candidato via status terminal negativo de booking/opportunity.';

create trigger close_candidates_on_booking_status
  after update of status on public.bookings
  for each row execute function public.close_candidates_on_structural_invalidation();

create trigger close_candidates_on_opportunity_status
  after update of status on public.opportunities
  for each row execute function public.close_candidates_on_structural_invalidation();

-- 8b. Uma aprovação real commita para uma chain -> fecha candidatos
--     antigos dessa MESMA chain (ground truth real supera proposta
--     não confirmada).
create function public.close_candidates_on_real_approval()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.communicated_proposal_candidates
  set status = 'structurally_closed',
      structurally_invalidated_at = now(),
      structurally_invalidated_reason = 'approval_record_committed'
  where professional_id = new.professional_id
    and commercial_root_id = new.commercial_root_id
    and decision_category = new.decision_category
    and subject_key = new.subject_key
    and status in ('open', 'possibly_superseded');

  return new;
end;
$$;

comment on function public.close_candidates_on_real_approval is 'Bloco 5 — segundo caminho determinístico de fechamento: uma approval_records real e commitada é ground truth, nunca inferência do classificador incremental.';

create trigger close_candidates_on_approval_record
  after insert on public.approval_records
  for each row execute function public.close_candidates_on_real_approval();

-- ============================================================
-- 9. try_acquire_approval_resolution_claim — transação #1 (curta):
--    idempotência + backoff + claim. NUNCA consome token do rate
--    limiter aqui — perder a corrida pelo claim (claim_held_by_
--    another_worker) não pode custar orçamento de ninguém (achado do
--    próprio Red Team de concorrência desta implementação: um
--    primeiro desenho debitava o token antes de saber se o claim
--    seria concedido, violando o V3.7 ponto 1 — "não pode consumir
--    cota sem representar chamada efetiva"). O débito do token
--    acontece só em reserve_approval_dispatch_token (função 9b),
--    chamada pelo worker DEPOIS de já ter vencido a corrida pelo
--    claim, imediatamente antes da chamada externa ao resolver.
--    context_identity corrente (Fc) é calculado em TS ANTES desta
--    chamada e passado como parâmetro — esta function nunca recalcula
--    ResolutionContext (isso é trabalho de aplicação, não de banco).
-- ============================================================
create function public.try_acquire_approval_resolution_claim(
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

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if v_professional_id is null or auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Já terminal (resolved)? Nunca reinfere.
  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and outcome = 'resolved') then
    return query select false, null::uuid, null::timestamptz, 'already_resolved';
    return;
  end if;

  -- Já existe uma pin não-terminal pro EXATO mesmo context_identity? Replay puro, não reinfere.
  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and context_identity = p_current_context_identity) then
    return query select false, null::uuid, null::timestamptz, 'already_pinned_for_context';
    return;
  end if;

  insert into public.approval_resolution_backoff (professional_statement_message_id)
  values (p_message_id)
  on conflict (professional_statement_message_id) do nothing;

  select * into v_backoff from public.approval_resolution_backoff where professional_statement_message_id = p_message_id for update;

  -- Backoff exponencial: só se aplica se o contexto é o MESMO já tentado.
  if v_backoff.last_context_identity is not null
     and v_backoff.last_context_identity = p_current_context_identity
     and now() < v_backoff.next_eligible_at then
    return query select false, null::uuid, null::timestamptz, 'backoff';
    return;
  end if;

  -- Claim: só concede se não há claim válido (lease ainda não expirado)
  -- de outro worker. Nenhum token de rate limiter é gasto aqui.
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

comment on function public.try_acquire_approval_resolution_claim is 'Bloco 5 — transação #1 (curta). Só posse (claim) + backoff exponencial. NUNCA débito de rate limiter (ver reserve_approval_dispatch_token) — perder a corrida pelo claim não pode custar orçamento.';

revoke all on function public.try_acquire_approval_resolution_claim from public;
grant execute on function public.try_acquire_approval_resolution_claim to authenticated;

-- ============================================================
-- 9b. reserve_approval_dispatch_token — transação B (V3.7): débito do
--     token do rate limiter, chamado pelo worker SÓ DEPOIS de já ter
--     vencido a corrida pelo claim (lease_token em mãos), imediatamente
--     antes da chamada externa ao resolver. Revalida o lease exato
--     (proteção ABA) na MESMA transação em que debita — fecha a janela
--     entre "achei que tinha lease" e "gastei orçamento".
-- ============================================================
create function public.reserve_approval_dispatch_token(
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
  v_backoff public.approval_resolution_backoff;
  v_elapsed double precision;
  v_new_tokens double precision;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_claim from public.approval_resolution_claims where professional_statement_message_id = p_message_id for update;
  if v_claim.professional_statement_message_id is null
     or v_claim.lease_token is distinct from p_lease_token
     or v_claim.lease_expires_at < now() then
    return query select false, 'lease_invalid_or_expired';
    return;
  end if;

  select * into v_backoff from public.approval_resolution_backoff where professional_statement_message_id = p_message_id for update;
  v_elapsed := extract(epoch from (now() - v_backoff.rate_last_refill_at));
  v_new_tokens := least(p_rate_capacity, v_backoff.rate_tokens + v_elapsed * (p_rate_capacity / p_rate_refill_period_seconds));

  if v_new_tokens < 1 then
    update public.approval_resolution_backoff set rate_tokens = v_new_tokens, rate_last_refill_at = now() where professional_statement_message_id = p_message_id;
    return query select false, 'rate_limited';
    return;
  end if;

  update public.approval_resolution_backoff
  set rate_tokens = v_new_tokens - 1, rate_last_refill_at = now()
  where professional_statement_message_id = p_message_id;

  return query select true, null::text;
end;
$$;

comment on function public.reserve_approval_dispatch_token is 'Bloco 5 — transação B (V3.7). Token representa reserva/autorização de tentativa de dispatch, debitado imediatamente antes da chamada externa — nunca antes, nunca sem lease_token válido revalidado na mesma transação. Se reserved=false, o worker NUNCA chama o resolver.';

revoke all on function public.reserve_approval_dispatch_token from public;
grant execute on function public.reserve_approval_dispatch_token to authenticated;

-- ============================================================
-- 9c. release_approval_resolution_claim — liberação explícita e
--     antecipada de um claim que o worker decidiu não usar (ex.:
--     reserve_approval_dispatch_token negou por rate_limited, ou
--     qualquer outro motivo de desistência antes de chamar o
--     resolver). Sem isso, o claim ficaria preso até lease_expires_at
--     mesmo quando o bloqueio real é de custo (rate limiter), não de
--     posse — achado do próprio teste de concorrência desta
--     implementação. Idempotente: sempre seguro chamar mesmo se o
--     lease já não bate mais (nesse caso é um no-op).
-- ============================================================
create function public.release_approval_resolution_claim(p_message_id uuid, p_lease_token uuid)
returns void
language sql
security definer set search_path = public
as $$
  delete from public.approval_resolution_claims
  where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
$$;

comment on function public.release_approval_resolution_claim is 'Bloco 5 — liberação antecipada e explícita de claim (ex.: apos reserve_approval_dispatch_token negar por rate_limited). Idempotente/no-op se o lease já não bate.';

revoke all on function public.release_approval_resolution_claim from public;
grant execute on function public.release_approval_resolution_claim to authenticated;

-- ============================================================
-- 10. commit_approval_resolution — transação #2: revalida posse
--     (lease_token exato), revalida terminal ainda inexistente,
--     revalida STALE CONTEXT (F1 usado na inferência vs. F2 atual,
--     recomputado pelo chamador imediatamente antes desta chamada) —
--     descarta silenciosamente (sem escrever nada) se F1<>F2.
-- ============================================================
create function public.commit_approval_resolution(
  p_message_id uuid,
  p_lease_token uuid,
  p_commercial_root_id uuid,             -- raiz comercial do statement sendo resolvido (sempre explícito, nunca derivado de p_decisions)
  p_inference_context_identity bytea,   -- F1: usado na chamada ao resolver
  p_current_context_identity bytea,      -- F2: recomputado agora, antes do commit
  p_context_schema_version text,
  p_outcome text,
  p_inconclusive_reason text,
  p_decisions jsonb                      -- [] quando inconclusive; array de decisões quando resolved
)
returns table (committed boolean, discard_reason text, approval_resolution_id uuid, approval_record_ids uuid[])
language plpgsql
security definer set search_path = public
as $$
declare
  v_claim public.approval_resolution_claims;
  v_professional_id uuid;
  v_decision jsonb;
  v_new_ids uuid[] := '{}';
  v_new_id uuid;
  v_lock_key bigint;
  v_next_version integer;
  v_resolution_id uuid;
  v_sorted_decisions jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_outcome not in ('resolved', 'inconclusive') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  select * into v_claim from public.approval_resolution_claims where professional_statement_message_id = p_message_id;

  -- Posse: lease_token exato e ainda válido. Proteção ABA (V3.3) —
  -- nunca aceita claimed_by sozinho.
  if v_claim.professional_statement_message_id is null
     or v_claim.lease_token is distinct from p_lease_token
     or v_claim.lease_expires_at < now() then
    return query select false, 'lease_invalid_or_expired', null::uuid, null::uuid[];
    return;
  end if;

  select c.represented_professional_id into v_professional_id
  from public.conversation_messages cm join public.conversations c on c.id = cm.conversation_id
  where cm.id = p_message_id;

  if auth.uid() is distinct from v_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Já terminal? (corrida com outro commit já bem-sucedido)
  if exists (select 1 from public.approval_resolutions where professional_statement_message_id = p_message_id and outcome = 'resolved') then
    delete from public.approval_resolution_claims where professional_statement_message_id = p_message_id and lease_token = p_lease_token;
    return query select false, 'already_resolved', null::uuid, null::uuid[];
    return;
  end if;

  -- STALE CONTEXT (V3.4, achado crítico): F1 usado na inferência
  -- precisa bater exatamente com F2 recomputado agora. Diferente ->
  -- descarta, NADA é escrito (nem approval_records, nem
  -- approval_resolutions), claim é liberado, retry é permitido.
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

    -- Backoff: mesmo contexto do último tentado -> escala; contexto
    -- novo -> reinicia a escala (V3.6), sem afetar rate_tokens (já
    -- debitados na aquisição do claim).
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

  -- outcome = 'resolved': p_decisions é array de objetos
  -- {commercialRootId, decisionCategory, subjectKey, operationType,
  --  approvedValue, communicatedProposalMessageIds, referredValue}.
  -- Locks de versionamento adquiridos em ORDEM ESTÁVEL (ordenado por
  -- chave textual) pra nunca gerar deadlock entre commits concorrentes
  -- que tocam chains sobrepostas em ordem diferente.
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

comment on function public.commit_approval_resolution is 'Bloco 5 — transação #2. p_inference_context_identity (F1) vs. p_current_context_identity (F2, recomputado pelo chamador imediatamente antes desta chamada): diferentes -> descarta tudo, nenhuma linha escrita (V3.4, stale context). Locks de versionamento em ordem estável evita deadlock entre commits concorrentes com chains sobrepostas.';

revoke all on function public.commit_approval_resolution from public;
grant execute on function public.commit_approval_resolution to authenticated;

-- ============================================================
-- 11. try_classify_communicated_proposal — classificação incremental
--     (V3.9/V3.10), pin-once, nunca remove/fecha candidato, só cria
--     ou rebaixa pra possibly_superseded. Bounded por
--     MAX_CANDIDATES_PER_CHAIN (checado em código antes de chamar,
--     documentado aqui como contrato).
-- ============================================================
create function public.try_classify_communicated_proposal(
  p_message_id uuid,
  p_classifier_version text,
  p_commercial_root_id uuid,
  p_outcome text,
  p_decision_category text default null,
  p_subject_key text default null,
  p_proposed_by text default null,
  p_proposed_value jsonb default null,
  p_supersedes_candidate_id uuid default null
)
returns table (already_classified boolean, resulting_candidate_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_new_candidate_id uuid;
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

  -- Pin-once: mensagem já classificada -> replay puro, nunca reclassifica.
  if exists (select 1 from public.communicated_proposal_classifications where message_id = p_message_id) then
    select cpc.resulting_candidate_id into v_new_candidate_id from public.communicated_proposal_classifications cpc where cpc.message_id = p_message_id;
    return query select true, v_new_candidate_id;
    return;
  end if;

  if p_outcome = 'not_a_proposal' then
    insert into public.communicated_proposal_classifications (message_id, professional_id, commercial_root_id, classifier_version, outcome, resulting_candidate_id)
    values (p_message_id, v_professional_id, p_commercial_root_id, p_classifier_version, p_outcome, null);
    return query select false, null::uuid;
    return;
  end if;

  if p_outcome = 'superseded_candidate' then
    if p_supersedes_candidate_id is null then
      raise exception 'supersedes_candidate_id_required' using errcode = '22023';
    end if;
    -- NUNCA remove/fecha o candidato antigo — só rebaixa (V3.10).
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

  return query select false, v_new_candidate_id;
end;
$$;

comment on function public.try_classify_communicated_proposal is 'Bloco 5 — classificação incremental pin-once. superseded_candidate SÓ rebaixa o alvo pra possibly_superseded (update), nunca DELETE nem status structurally_closed — essa autoridade é exclusiva dos triggers determinísticos (seção 8).';

revoke all on function public.try_classify_communicated_proposal from public;
grant execute on function public.try_classify_communicated_proposal to authenticated;

-- ============================================================
-- 12. Leitura — get_current_approval / get_active_approvals /
--     get_communicated_proposal_candidates. Normalizam root
--     internamente, nunca aceitam root pré-resolvido.
-- ============================================================
create function public.get_active_approvals(p_professional_id uuid, p_booking_id uuid default null, p_opportunity_id uuid default null)
returns setof public.approval_records
language sql
stable
as $$
  select distinct on (decision_category, subject_key) ar.*
  from public.approval_records ar
  where ar.professional_id = p_professional_id
    and ar.commercial_root_id = public.resolve_commercial_root_id(p_booking_id, p_opportunity_id)
  order by decision_category, subject_key, version desc;
$$;

comment on function public.get_active_approvals is 'Bloco 5 — última versão (approved_value mais recente) de cada chain (decision_category, subject_key) da raiz comercial. version desc pega o topo de cada chain, inclusive quando o topo é operation_type=revocation (approved_value null = "nada vigente").';

revoke all on function public.get_active_approvals from public;
grant execute on function public.get_active_approvals to authenticated;

create function public.get_communicated_proposal_candidates(p_professional_id uuid, p_booking_id uuid default null, p_opportunity_id uuid default null)
returns setof public.communicated_proposal_candidates
language sql
stable
as $$
  select cpc.*
  from public.communicated_proposal_candidates cpc
  where cpc.professional_id = p_professional_id
    and cpc.commercial_root_id = public.resolve_commercial_root_id(p_booking_id, p_opportunity_id)
    and cpc.status in ('open', 'possibly_superseded');
$$;

comment on function public.get_communicated_proposal_candidates is 'Bloco 5 — universo vivo (open + possibly_superseded) de candidatos comunicados pra montagem de ResolutionContext.communicatedProposalCandidates. structurally_closed nunca aparece aqui.';

revoke all on function public.get_communicated_proposal_candidates from public;
grant execute on function public.get_communicated_proposal_candidates to authenticated;

-- ============================================================
-- 13. RLS — posse decidida via professional_id = auth.uid()
--     diretamente (todas as tabelas deste bloco carregam a coluna,
--     seguindo a lição da 0039: uma única fonte de verdade de dono,
--     nunca via join composto). Sem policy de INSERT/UPDATE/DELETE
--     pra authenticated em nenhuma tabela — toda escrita passa pelas
--     functions security definer acima.
-- ============================================================
alter table public.approval_records enable row level security;
alter table public.communicated_proposal_candidates enable row level security;
alter table public.communicated_proposal_classifications enable row level security;
alter table public.approval_resolutions enable row level security;
alter table public.approval_resolution_claims enable row level security;
alter table public.approval_resolution_backoff enable row level security;

create policy "approval_records: select own" on public.approval_records
  for select using (auth.uid() = professional_id);

create policy "communicated_proposal_candidates: select own" on public.communicated_proposal_candidates
  for select using (auth.uid() = professional_id);

create policy "communicated_proposal_classifications: select own" on public.communicated_proposal_classifications
  for select using (auth.uid() = professional_id);

create policy "approval_resolutions: select own" on public.approval_resolutions
  for select using (auth.uid() = professional_id);

-- approval_resolution_claims/approval_resolution_backoff: estado
-- interno do motor, nunca consumido por UI de profissional na spec —
-- RLS habilitada, sem NENHUMA policy pra authenticated (deny-all;
-- só as functions security definer acima leem/escrevem, contornando
-- RLS por definer, exatamente como create_conversation na 0039).
