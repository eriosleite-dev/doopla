-- Doopla Intelligence Core v1 — Runtime: retomada durável de
-- runtime_pending_replies (migration 0053). Fecha o risco residual
-- documentado na seção 40 do PROGRESS.md: uma aprovação já resolvida
-- não pode morrer silenciosamente só porque a conversation estava
-- ocupada (`conversation_busy`) no momento exato da tentativa de
-- retomada.
--
-- Extensão pequena e isolada — nenhuma mudança em Blocos 1-4, nenhum
-- redesenho do que a migration 0053 já fechou. `policy_gate_decisions`
-- continua append-only. `runtime_pending_replies` continua a fonte
-- única de estado de workflow; esta migration só adiciona metadados de
-- agendamento/tentativa NA MESMA linha, nunca uma tabela paralela.
--
-- Padrão reaproveitado, nunca reinventado: claim atômico via
-- `select ... for update` (mesmo mecanismo já usado em outras
-- functions do Bloco 5) seguido de `UPDATE` condicional — o mesmo
-- boundary de idempotência já estabelecido em
-- `resolve_runtime_pending_reply_allowed`/`_still_blocked`.

-- ============================================================
-- 1. Colunas novas + status novo ('needs_attention') — terminal de
--    observabilidade, nunca reprocessado automaticamente de novo.
--    next_attempt_at NULL é o estado normal (só alcançável via um
--    approval commit que bate via shouldAttemptResume, igual hoje) —
--    só passa a ter um valor real depois da PRIMEIRA tentativa de
--    retomada desta linha (heartbeat de segurança, ver função 2), o
--    que também cobre um crash a meio da tentativa, não só
--    conversation_busy explícito.
-- ============================================================
alter table public.runtime_pending_replies
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_attempt_at timestamptz,
  add column last_attempt_at timestamptz;

alter table public.runtime_pending_replies drop constraint runtime_pending_replies_status_check;
alter table public.runtime_pending_replies add constraint runtime_pending_replies_status_check
  check (status in ('pending', 'completed', 'superseded', 'needs_attention'));

comment on column public.runtime_pending_replies.attempt_count is 'Quantas tentativas de retomada esta linha já sofreu (begin_runtime_pending_reply_attempt) — monotônico, nunca resetado; uma linha superseded por uma nova (create_runtime_pending_reply) sempre nasce em 0, nunca herda o contador da antiga.';
comment on column public.runtime_pending_replies.next_attempt_at is 'Quando esta linha volta a ficar elegível pro reconciler (list_due_runtime_pending_replies). NULL = só alcançável via approval-trigger (shouldAttemptResume), nunca pelo reconciler. Setado como heartbeat de segurança ANTES de cada tentativa (begin_runtime_pending_reply_attempt) e reagendado com backoff mais apertado quando a tentativa esbarra em conversation_busy (record_runtime_pending_reply_busy) — cobre tanto o caso nomeado quanto um crash a meio da tentativa.';
comment on column public.runtime_pending_replies.last_attempt_at is 'Só observabilidade — quando a última tentativa começou.';
comment on column public.runtime_pending_replies.status is 'pending: obrigação viva. completed: Gate permitiu, outbound criado (ou terminal-de-sucesso). superseded: substituída por uma pendência mais nova, ou raiz virou terminal. needs_attention: esgotou attempt_count sem resolver — teto de segurança, nunca mais retentado automaticamente, precisa de intervenção/observação humana.';

create index runtime_pending_replies_due_idx
  on public.runtime_pending_replies (next_attempt_at)
  where status = 'pending' and next_attempt_at is not null;

-- ============================================================
-- 2. begin_runtime_pending_reply_attempt — claim atômico do INÍCIO de
--    uma tentativa de retomada (aprovação-disparada OU reconciler).
--    Serve DUAS funções na mesma escrita: (a) heartbeat de segurança —
--    se o processo cair logo depois, next_attempt_at já aponta pro
--    futuro, o reconciler recupera sozinho; (b) claim de concorrência —
--    dois workers batendo na MESMA linha (reconciler duplicado, ou
--    reconciler + approval-trigger simultâneos) nunca processam a
--    mesma tentativa: o segundo vê next_attempt_at > now() (acabou de
--    ser empurrado pelo primeiro) e desiste, granted=false.
-- ============================================================
create function public.begin_runtime_pending_reply_attempt(
  p_pending_reply_id uuid,
  p_safety_net_seconds integer default 900,
  p_max_attempts integer default 8
)
returns table (granted boolean, attempt_count integer, exhausted boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.runtime_pending_replies;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.runtime_pending_replies where id = p_pending_reply_id for update;

  if v_row.id is null or v_row.status <> 'pending' then
    return query select false, coalesce(v_row.attempt_count, 0), false;
    return;
  end if;

  if v_row.next_attempt_at is not null and v_row.next_attempt_at > now() then
    -- Ainda não é a hora (ou outra tentativa acabou de reservar o
    -- horário) — nunca decide sozinho, fail-closed: quem chamou tenta
    -- de novo mais tarde.
    return query select false, v_row.attempt_count, false;
    return;
  end if;

  if v_row.attempt_count >= p_max_attempts then
    update public.runtime_pending_replies
      set status = 'needs_attention', resolved_at = now(), next_attempt_at = null
      where id = p_pending_reply_id;
    return query select false, v_row.attempt_count, true;
    return;
  end if;

  -- Colunas qualificadas de propósito (SET direito e RETURNING):
  -- "attempt_count" bare aqui seria ambíguo entre a coluna da tabela e
  -- o parâmetro OUT homônimo de returns table(...) — achado real
  -- durante os testes desta rodada.
  update public.runtime_pending_replies
    set attempt_count = public.runtime_pending_replies.attempt_count + 1,
        last_attempt_at = now(),
        next_attempt_at = now() + make_interval(secs => p_safety_net_seconds)
    where id = p_pending_reply_id
    returning public.runtime_pending_replies.attempt_count into v_row.attempt_count;

  return query select true, v_row.attempt_count, false;
end;
$$;

comment on function public.begin_runtime_pending_reply_attempt is 'Runtime — claim atômico do início de UMA tentativa de retomada. Sempre chamado ANTES de qualquer conversation lease/Planner/Gate — nunca decide se a tentativa vai dar certo, só se ELA PODE COMEÇAR agora. exhausted=true transiciona pra needs_attention na hora, sem gastar mais nenhuma tentativa.';

revoke all on function public.begin_runtime_pending_reply_attempt from public;
grant execute on function public.begin_runtime_pending_reply_attempt to service_role;
revoke execute on function public.begin_runtime_pending_reply_attempt from anon, authenticated;

-- ============================================================
-- 3. record_runtime_pending_reply_busy — chamado quando a tentativa
--    (já iniciada por begin_runtime_pending_reply_attempt) esbarrou em
--    conversation_busy: substitui o heartbeat genérico por um backoff
--    mais apertado (o chamador já sabe o motivo específico). Nunca
--    reincrementa attempt_count de novo (já foi feito no begin) — só
--    reagenda, ou, se este JÁ era o último attempt permitido, fecha
--    pra needs_attention direto (sem esperar o próximo begin_attempt
--    descobrir isso).
-- ============================================================
create function public.record_runtime_pending_reply_busy(
  p_pending_reply_id uuid,
  p_backoff_seconds integer,
  p_max_attempts integer default 8
)
returns table (recorded boolean, next_attempt_at timestamptz, exhausted boolean)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.runtime_pending_replies;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.runtime_pending_replies
    where id = p_pending_reply_id and status = 'pending' for update;

  if v_row.id is null then
    -- Já foi resolvida/superseded por outro caminho enquanto esta
    -- tentativa rodava — nunca reabre, no-op idempotente.
    return query select false, null::timestamptz, false;
    return;
  end if;

  if v_row.attempt_count >= p_max_attempts then
    update public.runtime_pending_replies
      set status = 'needs_attention', resolved_at = now(), next_attempt_at = null
      where id = p_pending_reply_id;
    return query select true, null::timestamptz, true;
    return;
  end if;

  -- Mesmo achado do begin_attempt acima: "next_attempt_at" bare na
  -- RETURNING seria ambíguo contra o parâmetro OUT homônimo.
  update public.runtime_pending_replies
    set next_attempt_at = now() + make_interval(secs => p_backoff_seconds)
    where id = p_pending_reply_id
    returning public.runtime_pending_replies.next_attempt_at into v_row.next_attempt_at;

  return query select true, v_row.next_attempt_at, false;
end;
$$;

comment on function public.record_runtime_pending_reply_busy is 'Runtime — registra que a tentativa em curso esbarrou em conversation_busy: reagenda com backoff mais apertado que o heartbeat genérico, ou fecha pra needs_attention se attempt_count já esgotou o teto. Nunca toca em outbound_intents/status=completed — a pendência continua pending, explicitamente retryable.';

revoke all on function public.record_runtime_pending_reply_busy from public;
grant execute on function public.record_runtime_pending_reply_busy to service_role;
revoke execute on function public.record_runtime_pending_reply_busy from anon, authenticated;

-- ============================================================
-- 4. list_due_runtime_pending_replies — descoberta pro
--    reconciler/worker. Nunca decide matching/elegibilidade de
--    identidade (isso é só do caminho aprovação-disparada,
--    shouldAttemptResume em TS) — aqui é só "essa linha já passou do
--    horário agendado", o resto do ciclo (Planner+Gate frescos) é
--    idêntico ao caminho aprovação-disparada.
-- ============================================================
create function public.list_due_runtime_pending_replies(p_limit integer default 50)
returns setof public.runtime_pending_replies
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query select * from public.runtime_pending_replies
  where status = 'pending' and next_attempt_at is not null and next_attempt_at <= now()
  order by next_attempt_at asc
  limit p_limit;
end;
$$;

revoke all on function public.list_due_runtime_pending_replies from public;
grant execute on function public.list_due_runtime_pending_replies to service_role;
revoke execute on function public.list_due_runtime_pending_replies from anon, authenticated;

-- ============================================================
-- 5. Higiene: as três functions da migration 0053 que finalizam uma
--    linha (completed/superseded) passam a limpar next_attempt_at —
--    uma linha terminal nunca deveria carregar um agendamento futuro
--    pendurado (nunca é lido de novo por list_due_runtime_pending_replies,
--    que já filtra status='pending', mas deixar o dado coerente evita
--    confusão numa leitura direta/observabilidade futura). Mesma
--    assinatura, `create or replace` — nenhum comportamento de
--    negócio muda além desta limpeza.
-- ============================================================
create or replace function public.resolve_runtime_pending_reply_allowed(
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
  set status = 'completed', resolved_at = now(), next_attempt_at = null
  where id = p_pending_reply_id and status = 'pending'
  returning * into v_pending;

  if v_pending.id is null then
    return query select false, null::uuid;
    return;
  end if;

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

create or replace function public.resolve_runtime_pending_reply_still_blocked(
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
  set status = 'superseded', resolved_at = now(), next_attempt_at = null
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

create or replace function public.supersede_runtime_pending_replies_for_terminal_root(p_commercial_root_id uuid)
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
  set status = 'superseded', resolved_at = now(), next_attempt_at = null
  where commercial_root_id = p_commercial_root_id and status = 'pending';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_runtime_pending_reply(
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
    set status = 'superseded', superseded_by_id = v_row.id, resolved_at = now(), next_attempt_at = null
    where id = any(p_supersede_ids) and status = 'pending' and commercial_root_id = p_commercial_root_id;
  end if;

  return v_row;
end;
$$;
