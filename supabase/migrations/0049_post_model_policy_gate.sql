-- Doopla Intelligence Core v1 — Post-model Policy Gate (bloco novo,
-- pós Bloco 5/Approval Engine).
--
-- Este bloco NUNCA cria autoridade — só LÊ approval_records (via
-- get_active_approvals, já existente na migration 0045) e decide,
-- 100% em código TS (ver src/lib/intelligence/policy-gate-post/),
-- se um compromisso que a Doopla está prestes a comunicar tem
-- aprovação real, exata, aplicável. Este arquivo só adiciona o que
-- faltava no lado SQL: (1) verificação de status estrutural terminal
-- do commercial root (approval_records nunca é invalidado
-- automaticamente quando um booking/opportunity é cancelado — gap já
-- documentado na migration 0047, fechado aqui pro Policy Gate, não
-- alterando o Bloco 5); (2) observabilidade append-only das decisões
-- do Gate.

-- ============================================================
-- 1. is_commercial_root_terminal — reusa commercial_root_belongs_to_professional
--    (migration 0047) pra ownership; reusa a MESMA lista de status
--    terminal já usada pelo trigger determinístico
--    close_candidates_on_structural_invalidation (migration 0045) —
--    nunca uma segunda lista que pode divergir da primeira.
-- ============================================================
create function public.is_commercial_root_terminal(p_commercial_root_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.commercial_root_belongs_to_professional(p_commercial_root_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return exists (
    select 1 from public.bookings where id = p_commercial_root_id and status in ('recusada', 'cancelada')
  ) or exists (
    select 1 from public.opportunities where id = p_commercial_root_id and status = 'cancelada'
  );
end;
$$;

comment on function public.is_commercial_root_terminal is 'Post-model Policy Gate — status terminal negativo (mesma lista do trigger close_candidates_on_structural_invalidation, migration 0045). Uma approval_records ainda "ativa" (get_active_approvals) sobre um commercial root terminal nunca pode ser tratada como aplicável — approval_records em si nunca é invalidado automaticamente, esta function é a checagem que o Policy Gate faz por fora antes de aceitar qualquer match.';

revoke all on function public.is_commercial_root_terminal from public;
grant execute on function public.is_commercial_root_terminal to authenticated;
revoke execute on function public.is_commercial_root_terminal from anon;

-- ============================================================
-- 2. policy_gate_decisions — append-only, observabilidade do Gate.
--    Nunca guarda proposedResponse inteiro nem valores aprovados
--    duplicados (isso já vive em approval_records, referenciável por
--    matchedApprovalRecordId dentro de checks) — só o necessário pra
--    auditar POR QUE uma mensagem foi bloqueada/liberada.
-- ============================================================
create table public.policy_gate_decisions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete restrict,
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  -- Nunca fk pra bookings/opportunities diretamente (commercial_root_id
  -- é um dos dois, resolve_commercial_root_id já documenta isso) —
  -- mesmo padrão de approval_records/communicated_proposal_candidates.
  commercial_root_id uuid not null,
  message_id uuid references public.conversation_messages (id) on delete set null,
  run_id uuid references public.orchestrator_runs (id) on delete set null,

  outcome text not null check (outcome in ('allowed', 'blocked')),
  policy_version text not null,
  -- Controlado (CHECK), nunca texto livre — espelha
  -- POLICY_GATE_BLOCK_REASONS em policy-gate-post/types.ts. Só
  -- preenchido quando outcome='blocked' (ver CHECK simétrico abaixo).
  primary_block_reason text check (primary_block_reason in (
    'no_matching_approval', 'value_mismatch', 'subject_key_unresolved',
    'commercial_root_terminal', 'invalid_extracted_value', 'extraction_unavailable'
  )),
  -- Breakdown por commitment verificado — decisionCategory/subjectKey/
  -- result/blockReason/matchedApprovalRecordId sempre; extractedValueForDebug
  -- só quando result='blocked' (ver comentário em log.ts). JSONB é
  -- suficiente aqui: nunca consultado por campo interno em SQL, só lido
  -- de volta inteiro por quem audita (Admin/Observer futuros).
  checks jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  check ((outcome = 'blocked') = (primary_block_reason is not null))
);

comment on table public.policy_gate_decisions is 'Post-model Policy Gate — log append-only de toda avaliação (nunca UPDATE/DELETE). professional_id/conversation_id/commercial_root_id são colunas diretas (não só deriváveis via run_id) porque run_id é nullable — nem toda avaliação do harness/testes tem uma orchestrator_runs correspondente ainda.';

create index policy_gate_decisions_conversation_idx on public.policy_gate_decisions (conversation_id, created_at);
create index policy_gate_decisions_professional_idx on public.policy_gate_decisions (professional_id, created_at);

alter table public.policy_gate_decisions enable row level security;

-- Select-own: profissional lê as próprias decisões do Gate. Nenhuma
-- policy de insert/update/delete — escrita exclusiva via
-- record_policy_gate_decision (security definer), mesmo padrão de toda
-- tabela sensível deste projeto.
create policy "policy_gate_decisions: select own" on public.policy_gate_decisions
  for select to authenticated
  using (professional_id = auth.uid());

-- ============================================================
-- 3. record_policy_gate_decision — único caminho de escrita.
-- ============================================================
create function public.record_policy_gate_decision(
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
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select represented_professional_id into v_professional_id
  from public.conversations where id = p_conversation_id;

  if v_professional_id is null or auth.uid() is distinct from v_professional_id then
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

comment on function public.record_policy_gate_decision is 'Post-model Policy Gate — único caminho de escrita de policy_gate_decisions. Revalida ownership do commercial_root_id (reusa commercial_root_belongs_to_professional, migration 0047) e outcome/primary_block_reason (CHECK físico da tabela é a defesa final, nunca só esta validação em código).';

revoke all on function public.record_policy_gate_decision from public;
grant execute on function public.record_policy_gate_decision to authenticated;
revoke execute on function public.record_policy_gate_decision from anon;
