-- Doopla Intelligence Core v1 — ADR 0006 (16/10/2026): fundação de
-- persistência pro concierge de pendências/acompanhamento proativo
-- (intelligence/concierge/pending-followups.ts, puro, já testado).
--
-- Espelha PendingFollowup 1:1. Mesma arquitetura de
-- 0119_professional_memories.sql: esta migration é só a camada de
-- persistência — toda a lógica de decisão (validação de input, regra
-- de "nunca insiste além do teto", cálculo de due_at) já vive e já é
-- testada em pending-followups.ts (puro, zero I/O). As functions
-- abaixo nunca reimplementam essa lógica: só persistem o objeto que a
-- function pura já validou/construiu, com guarda atômica de estado
-- (UPDATE ... WHERE status = 'open') pra nunca permitir duas
-- transições concorrentes da mesma pendência.
--
-- Categorias de pendência vêm de DOOPLA_AI_FIRST_DOCUMENTO_MESTRE_V2.docx
-- (seção 43, Follow-up) — gatilhos operacionais já decididos pela
-- fundadora, nunca lembretes inventados (ver pending-followups.ts).
--
-- Fora de escopo desta migration, por instrução explícita da fundadora
-- ("não quero novas alterações no Planner antes de avaliarmos as
-- respostas produzidas pelo modelo"): nenhum wiring em runtime/cron,
-- nenhuma tela de painel que leia/crie pendências automaticamente.
-- Fundação pura, testada localmente, nunca aplicada em staging/produção
-- sem aprovação específica.

create table public.pending_followups (
  id uuid primary key,
  professional_id uuid not null references public.profiles (id) on delete cascade,

  booking_id uuid references public.bookings (id) on delete cascade,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  -- Nunca uma pendência solta, sem vínculo operacional — mesmo
  -- invariante já validado por createPendingFollowup (TS).
  constraint pending_followups_requires_booking_or_opportunity check (booking_id is not null or opportunity_id is not null),

  kind text not null check (
    kind in ('proposal_no_response', 'client_said_will_check_internally', 'client_promised_return_by_date', 'contract_awaiting_signature', 'deposit_or_balance_pending', 'missing_production_info')
  ),

  -- Quem precisa agir pra destravar — nunca ambíguo (ver comentário em
  -- PendingFollowup, TS).
  responsible_party text not null check (responsible_party in ('doopla', 'professional', 'external_participant')),

  -- {"sourceType": "conversation_message"|"booking"|"opportunity", "sourceId": "..."}
  evidence jsonb not null check (evidence ? 'sourceType' and evidence ? 'sourceId'),

  -- Prazo PROMETIDO pela própria pessoa, nunca inventado pela Doopla —
  -- null quando não há prazo explícito (ver comentário em TS).
  promised_return_at timestamptz,
  -- Quando este follow-up deveria ser revisitado — sempre calculado
  -- por quem chama createPendingFollowup, nunca null.
  due_at timestamptz not null,

  status text not null default 'open' check (status in ('open', 'resolved', 'closed_no_response', 'cancelled')),

  created_at timestamptz not null,
  resolved_at timestamptz,

  -- Nunca insiste infinitamente (Documento Mestre, seção 43) — teto de
  -- tentativas é decisão de quem chama (maxAttempts), nunca um valor
  -- mágico nesta tabela.
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

comment on table public.pending_followups is 'ADR 0006 — persistência de PendingFollowup (concierge/pending-followups.ts, puro, já testado). Gatilhos operacionais reais (Documento Mestre, seção 43), nunca lembretes inventados. Esta migration é só persistência — toda a lógica de decisão vive e é testada em TS.';
comment on column public.pending_followups.evidence is 'PendingFollowupEvidence (TS): {sourceType, sourceId}. Sempre rastreável até a origem real — nunca um gatilho sem evidência.';

create index pending_followups_professional_idx on public.pending_followups (professional_id);
create index pending_followups_professional_status_idx on public.pending_followups (professional_id, status);
create index pending_followups_booking_idx on public.pending_followups (booking_id) where booking_id is not null;
create index pending_followups_opportunity_idx on public.pending_followups (opportunity_id) where opportunity_id is not null;

alter table public.pending_followups enable row level security;
-- Sem policy pra authenticated/anon — mesmo padrão do resto do projeto
-- (professional_contact_memories/professional_memories/
-- pending_delegated_contacts). Um painel que precise listar pendências
-- um dia passa por uma function própria com is_system_caller()/
-- auth.uid() verificando o dono, nunca por policy direta nesta tabela.

-- ============================================================
-- 1. create_pending_followup — único jeito de uma pending_followups
--    nascer. Persiste exatamente o objeto já validado/construído por
--    createPendingFollowup (TS). Sempre status='open' (hardcoded),
--    resolved_at=null, attempt_count=0 — nunca aceitos como parâmetro.
-- ============================================================
create function public.create_pending_followup(
  p_id uuid,
  p_professional_id uuid,
  p_kind text,
  p_responsible_party text,
  p_evidence jsonb,
  p_due_at timestamptz,
  p_created_at timestamptz,
  p_booking_id uuid default null,
  p_opportunity_id uuid default null,
  p_promised_return_at timestamptz default null
)
returns public.pending_followups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_followups;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.pending_followups (
    id, professional_id, booking_id, opportunity_id, kind, responsible_party, evidence, promised_return_at, due_at, status, created_at, attempt_count
  )
  values (
    p_id, p_professional_id, p_booking_id, p_opportunity_id, p_kind, p_responsible_party, p_evidence, p_promised_return_at, p_due_at, 'open', p_created_at, 0
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_pending_followup is 'Único jeito de uma pending_followups nascer. Persiste exatamente o objeto já validado/construído por createPendingFollowup (pending-followups.ts, TS). Sempre status=open, attempt_count=0.';

revoke all on function public.create_pending_followup from public;
grant execute on function public.create_pending_followup to service_role;
revoke execute on function public.create_pending_followup from anon, authenticated;

-- ============================================================
-- 2/3/4. Transições de 'open' pra um status terminal — guarda atômica
--    (WHERE status='open') nunca permite duas transições concorrentes
--    da mesma pendência. Sempre exige professional_id dono.
-- ============================================================
create function public.resolve_pending_followup(p_id uuid, p_professional_id uuid, p_resolved_at timestamptz)
returns public.pending_followups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_followups;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_followups
  set status = 'resolved', resolved_at = p_resolved_at
  where id = p_id and professional_id = p_professional_id and status = 'open'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_open' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.resolve_pending_followup is 'Transição open -> resolved. Guarda atômica (WHERE status=open) nunca permite duas transições concorrentes da mesma pendência — mesmo invariante de resolvePendingFollowup (TS).';

revoke all on function public.resolve_pending_followup from public;
grant execute on function public.resolve_pending_followup to service_role;
revoke execute on function public.resolve_pending_followup from anon, authenticated;

create function public.close_pending_followup_as_no_response(p_id uuid, p_professional_id uuid, p_resolved_at timestamptz)
returns public.pending_followups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_followups;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_followups
  set status = 'closed_no_response', resolved_at = p_resolved_at
  where id = p_id and professional_id = p_professional_id and status = 'open'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_open' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.close_pending_followup_as_no_response is 'Transição open -> closed_no_response ("encerrar como sem retorno", Documento Mestre seção 43) — nunca apaga, sempre um status terminal explícito. Mesmo invariante de closePendingFollowupAsNoResponse (TS).';

revoke all on function public.close_pending_followup_as_no_response from public;
grant execute on function public.close_pending_followup_as_no_response to service_role;
revoke execute on function public.close_pending_followup_as_no_response from anon, authenticated;

create function public.cancel_pending_followup(p_id uuid, p_professional_id uuid, p_resolved_at timestamptz)
returns public.pending_followups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_followups;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_followups
  set status = 'cancelled', resolved_at = p_resolved_at
  where id = p_id and professional_id = p_professional_id and status = 'open'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_open' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.cancel_pending_followup is 'Transição open -> cancelled. Mesmo invariante de cancelPendingFollowup (TS).';

revoke all on function public.cancel_pending_followup from public;
grant execute on function public.cancel_pending_followup to service_role;
revoke execute on function public.cancel_pending_followup from anon, authenticated;

-- ============================================================
-- 5. reschedule_open_pending_followup — reagenda uma pendência aberta
--    pra uma nova data (ex.: reenvio de follow-up). Incrementa
--    attempt_count sempre, nunca silenciosamente (mesmo invariante de
--    rescheduleOpenFollowup, TS).
-- ============================================================
create function public.reschedule_open_pending_followup(p_id uuid, p_professional_id uuid, p_next_due_at timestamptz)
returns public.pending_followups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_followups;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_followups
  set due_at = p_next_due_at, attempt_count = attempt_count + 1
  where id = p_id and professional_id = p_professional_id and status = 'open'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_open' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.reschedule_open_pending_followup is 'Reagenda uma pendência aberta (nova due_at) e incrementa attempt_count sempre — mesmo invariante de rescheduleOpenFollowup (TS). Nunca insiste além do teto: quem chama decide fechar como closed_no_response quando attempt_count >= maxAttempts.';

revoke all on function public.reschedule_open_pending_followup from public;
grant execute on function public.reschedule_open_pending_followup to service_role;
revoke execute on function public.reschedule_open_pending_followup from anon, authenticated;

-- ============================================================
-- 6. list_open_pending_followups — único ponto de leitura pro futuro
--    sweep/cron (wiring fora desta migration). Devolve só status='open'
--    — o cálculo de "vencido"/"estourou o teto de tentativas" continua
--    só em selectDuePendingFollowups/selectFollowupsToCloseAsNoResponse
--    (TS, já testados), nunca duplicado aqui.
-- ============================================================
create function public.list_open_pending_followups(p_professional_id uuid)
returns setof public.pending_followups
language sql
security definer set search_path = public
stable
as $$
  select *
  from public.pending_followups
  where professional_id = p_professional_id
    and status = 'open'
  order by due_at asc;
$$;

comment on function public.list_open_pending_followups is 'Leitura pro futuro sweep/cron (wiring fora desta migration) — só status=open, isolado por professional_id. "Vencido"/"estourou tentativas" continua só nas functions puras TS, já testadas, nunca duplicado em SQL.';

revoke all on function public.list_open_pending_followups from public;
grant execute on function public.list_open_pending_followups to service_role;
revoke execute on function public.list_open_pending_followups from anon, authenticated;
