-- P0 — fila persistida de mensagens professional_self (14/10/2026,
-- revisão 2). Substitui a mitigação anterior (retentativa inline com
-- setTimeout 2s+4s, migration 0107) por persistência ANTES de
-- qualquer tentativa de ciclo — a retentativa por tempo nunca
-- registrava a mensagem em lugar nenhum; se as tentativas se
-- esgotassem, a mensagem desaparecia sem nenhum rastro (confirmado por
-- teste real em intake-orchestration.test.ts, "simula duas mensagens
-- reais consecutivas...").
--
-- Escopo estritamente isolado: nenhuma linha de inbound_events,
-- conversation_processing_leases, create_conversation (ramo 1,
-- external_inquiry) ou qualquer função do Classifier/Planner/Approval
-- Engine é tocada por esta migration. Todo o mecanismo novo vive em
-- tabelas/functions próprias, consumidas só por professional_self.
--
-- Nunca reaproveita runtime_pending_replies (migration 0053/0054) nem
-- inbound_events pra este propósito — são domínios estruturalmente
-- diferentes (um é "resposta bloqueada pelo Approval Engine", outro é
-- "ledger de idempotência física do webhook"; nenhum dos dois guarda
-- corpo de mensagem pra reprocessamento, que é exatamente o que falta
-- aqui).

-- ============================================================
-- 1. professional_self_pending_messages — cada mensagem do
--    profissional pro WhatsApp oficial é gravada aqui ANTES de
--    qualquer tentativa de rodar o ciclo. A linha só sai do estado
--    'pending'/'processing' por sucesso real (-> completed) ou por
--    esgotar max_attempts (-> failed, terminal, nunca mais
--    retomada automaticamente).
-- ============================================================
create table public.professional_self_pending_messages (
  id uuid primary key default gen_random_uuid(),
  represented_professional_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,

  -- Idempotência física pelo id do próprio evento da Meta (wamid) —
  -- mesmo papel de inbound_events.provider_event_id (migration 0051),
  -- só que aqui também guardamos o corpo, que inbound_events nunca
  -- guarda.
  provider_message_id text not null,
  body text,
  -- Timestamp do PRÓPRIO WhatsApp (message.timestamp) — nunca o
  -- instante de chegada do webhook. É a chave de ordenação real: dois
  -- webhooks podem chegar fora de ordem na rede: ver comentário maior
  -- sobre o limite de ordenação logo abaixo (claim_next_...).
  provider_timestamp timestamptz,

  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  -- Backoff mínimo entre tentativas reais (nunca aplicado a
  -- conversation_busy/duplicate-em-voo, só a falhas de verdade) — sem
  -- isto, mensagens rápidas do profissional (ex.: "Sim", "Oi",
  -- "Confirma" em poucos segundos) poderiam esgotar as 5 tentativas de
  -- uma linha travada em segundos, só porque cada nova mensagem
  -- dispara um novo drain inline.
  next_attempt_at timestamptz,
  -- Safety-net de processo: cobre um crash a meio de uma tentativa
  -- (claimed mas nunca finished) — mesmo papel de
  -- inbound_events.lease_expires_at.
  lease_expires_at timestamptz,

  conversation_message_id uuid references public.conversation_messages (id) on delete set null,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  unique (provider_message_id)
);

comment on table public.professional_self_pending_messages is 'P0 14/10/2026 — fila persistida e exclusiva de professional_self. Toda mensagem do profissional pro WhatsApp oficial é gravada aqui antes de qualquer tentativa de ciclo (Classifier/Planner/Approval Engine); a linha nunca desaparece silenciosamente, só por completed (sucesso real, corpo zerado) ou failed (tentativas esgotadas, corpo retido por até 7 dias pra investigação, depois zerado por purge_expired_professional_self_pending_message_bodies). Nunca usado por external_inquiry.';

create index professional_self_pending_messages_professional_status_idx
  on public.professional_self_pending_messages (represented_professional_id, status);

alter table public.professional_self_pending_messages enable row level security;
-- Sem policy pra authenticated/anon — estado interno do Runtime, mesmo
-- padrão de inbound_events/conversation_processing_leases. service_role
-- bypassa RLS.

-- ============================================================
-- 2. professional_self_drain_leases — exclusão mútua por
--    PROFISSIONAL (não por linha individual). FOR UPDATE SKIP LOCKED
--    sozinho protegeria uma linha, mas nunca impediria que dois drains
--    concorrentes (ex.: a tentativa inline de uma mensagem nova e o
--    tick do cron) processassem linhas DIFERENTES do mesmo
--    profissional ao mesmo tempo — o que quebraria a ordem (uma
--    mensagem mais nova poderia terminar antes de uma mais antiga
--    ainda bloqueada). Mesmo padrão de claim/lease de
--    conversation_processing_leases (migration 0051), só que no nível
--    do DRAIN inteiro (todas as linhas pendentes de um profissional),
--    nunca do ciclo individual — por isso é uma tabela própria, nunca
--    a mesma: processInboundEvent já adquire/libera
--    conversation_processing_leases por chamada, e se o laço de drain
--    também segurasse essa trava por toda a duração, cada chamada
--    interna a triggerInboundMessage se autobloquearia.
-- ============================================================
create table public.professional_self_drain_leases (
  represented_professional_id uuid primary key references public.profiles (id) on delete cascade,
  claimed_by text not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null,
  claimed_at timestamptz not null default now()
);

comment on table public.professional_self_drain_leases is 'P0 14/10/2026 — no máximo um drain (inline ou cron) processando a fila de um profissional por vez. Garante que a ordem de chegada (provider_timestamp) seja respeitada mesmo sob chamadas concorrentes, sem precisar de uma fila/worker genérico.';

alter table public.professional_self_drain_leases enable row level security;

create function public.acquire_professional_self_drain_lease(p_professional_id uuid, p_worker_id text, p_lease_seconds integer default 60)
returns table (granted boolean, lease_token uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_lease_token uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_lease_token := gen_random_uuid();

  insert into public.professional_self_drain_leases (represented_professional_id, claimed_by, lease_token, lease_expires_at)
  values (p_professional_id, p_worker_id, v_lease_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (represented_professional_id) do update
    set claimed_by = excluded.claimed_by, lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at, claimed_at = now()
  where public.professional_self_drain_leases.lease_expires_at < now();

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  return query select true, v_lease_token;
end;
$$;

revoke all on function public.acquire_professional_self_drain_lease from public;
grant execute on function public.acquire_professional_self_drain_lease to service_role;
revoke execute on function public.acquire_professional_self_drain_lease from anon, authenticated;

create function public.release_professional_self_drain_lease(p_professional_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.professional_self_drain_leases
  where represented_professional_id = p_professional_id and lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.release_professional_self_drain_lease from public;
grant execute on function public.release_professional_self_drain_lease to service_role;
revoke execute on function public.release_professional_self_drain_lease from anon, authenticated;

-- ============================================================
-- 3. enqueue — sempre a primeira escrita, antes de qualquer
--    triggerInboundMessage. Idempotente por provider_message_id: uma
--    reentrega do mesmo wamid nunca cria uma segunda linha.
-- ============================================================
create function public.enqueue_professional_self_pending_message(
  p_professional_id uuid,
  p_conversation_id uuid,
  p_provider_message_id text,
  p_body text,
  p_provider_timestamp timestamptz default null
)
returns public.professional_self_pending_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_self_pending_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.professional_self_pending_messages (
    represented_professional_id, conversation_id, provider_message_id, body, provider_timestamp
  ) values (
    p_professional_id, p_conversation_id, p_provider_message_id, p_body, p_provider_timestamp
  )
  on conflict (provider_message_id) do nothing
  returning * into v_row;

  if found then
    return v_row;
  end if;

  select * into v_row from public.professional_self_pending_messages where provider_message_id = p_provider_message_id;
  return v_row;
end;
$$;

revoke all on function public.enqueue_professional_self_pending_message from public;
grant execute on function public.enqueue_professional_self_pending_message to service_role;
revoke execute on function public.enqueue_professional_self_pending_message from anon, authenticated;

-- ============================================================
-- 4. claim — pega sempre a linha mais antiga ELEGÍVEL do
--    profissional (nunca pula pra uma mais nova só porque a mais
--    antiga está bloqueada: isso é papel do CHAMADOR, que deve parar o
--    laço ao receber 'processing em voo' — ver professional-self-
--    pending-messages.ts). Elegível = pending com next_attempt_at
--    vencido (ou nulo), OU processing com lease vencida (crash de
--    processo).
--
--    Limite de ordenação (documentado, não eliminado por este
--    desenho): provider_timestamp reflete quando a Meta recebeu a
--    mensagem, não quando o webhook chegou aqui. Duas entregas HTTP
--    concorrentes (duas invocações serverless em paralelo) ainda podem
--    INSERIR fora de ordem relativa uma à outra antes de qualquer
--    drain rodar — se a inserção da mensagem mais nova terminar antes
--    da mais antiga, um drain que rode nesse instante só vê a mais
--    nova na fila e a processa primeiro. A trava de profissional acima
--    impede que ISSO aconteça DEPOIS que ambas já estão na fila; não
--    impede uma corrida na própria gravação. Risco residual aceito,
--    idêntico em natureza ao que já existia antes desta migration.
-- ============================================================
-- setof (nunca o tipo composto puro) de propósito: esta função
-- legitimamente pode não ter nada a devolver (fila vazia pro
-- profissional), e setof + .maybeSingle() no lado TS é o idioma já
-- comprovado no projeto pra "zero ou uma linha" (ex.: qualquer
-- .maybeSingle() em professional_whatsapp_identities) — nunca a
-- ambiguidade de "return null" num tipo composto puro.
create function public.claim_next_professional_self_pending_message(p_professional_id uuid, p_lease_seconds integer default 180)
returns setof public.professional_self_pending_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select id into v_id
  from public.professional_self_pending_messages
  where represented_professional_id = p_professional_id
    and (
      (status = 'pending' and (next_attempt_at is null or next_attempt_at <= now()))
      or (status = 'processing' and lease_expires_at < now())
    )
  order by coalesce(provider_timestamp, created_at) asc
  limit 1
  for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
    update public.professional_self_pending_messages
    set status = 'processing', attempt_count = attempt_count + 1,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where id = v_id
    returning *;
end;
$$;

revoke all on function public.claim_next_professional_self_pending_message from public;
grant execute on function public.claim_next_professional_self_pending_message to service_role;
revoke execute on function public.claim_next_professional_self_pending_message from anon, authenticated;

-- ============================================================
-- 5. finish — três desfechos possíveis depois de uma tentativa:
--    'completed' (sucesso real, corpo zerado imediatamente — a fonte
--    de verdade passa a ser conversation_messages), 'pending'
--    (devolve pra fila — busy/em voo noutro lugar/falha transitória
--    ainda com tentativas sobrando, com backoff opcional) ou 'failed'
--    (tentativas esgotadas, terminal, corpo retido só até o prazo de
--    retenção).
-- ============================================================
create function public.finish_professional_self_pending_message(
  p_id uuid,
  p_status text,
  p_conversation_message_id uuid default null,
  p_error text default null,
  p_next_attempt_seconds integer default null
)
returns public.professional_self_pending_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_self_pending_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'pending', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if p_status = 'completed' then
    update public.professional_self_pending_messages
    set status = 'completed', conversation_message_id = coalesce(p_conversation_message_id, conversation_message_id),
        body = null, error = null, completed_at = now(), updated_at = now()
    where id = p_id
    returning * into v_row;
  elsif p_status = 'failed' then
    update public.professional_self_pending_messages
    set status = 'failed', error = p_error, updated_at = now()
    where id = p_id
    returning * into v_row;
  else
    update public.professional_self_pending_messages
    set status = 'pending', error = p_error, updated_at = now(),
        next_attempt_at = case when p_next_attempt_seconds is not null then now() + make_interval(secs => p_next_attempt_seconds) else null end
    where id = p_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.finish_professional_self_pending_message from public;
grant execute on function public.finish_professional_self_pending_message to service_role;
revoke execute on function public.finish_professional_self_pending_message from anon, authenticated;

-- ============================================================
-- 6. Leitura pro cron — lista profissionais com trabalho elegível,
--    ordenados pelo pending MAIS ANTIGO primeiro (nunca ordem
--    arbitrária de tabela): garante que, mesmo acima de 50
--    profissionais pendentes num mesmo tick, ninguém fica esquecido
--    pra sempre — o atraso extra fica limitado a (profissionais
--    pendentes / 50) ticks do cron, nunca indefinido.
-- ============================================================
create function public.list_professional_self_pending_professionals(p_limit integer default 50)
returns table (represented_professional_id uuid)
language sql
security definer set search_path = public
stable
as $$
  select represented_professional_id
  from public.professional_self_pending_messages
  where (status = 'pending' and (next_attempt_at is null or next_attempt_at <= now()))
     or (status = 'processing' and lease_expires_at < now())
  group by represented_professional_id
  order by min(created_at) asc
  limit p_limit;
$$;

revoke all on function public.list_professional_self_pending_professionals from public;
grant execute on function public.list_professional_self_pending_professionals to service_role;
revoke execute on function public.list_professional_self_pending_professionals from anon, authenticated;

-- ============================================================
-- 7. Retenção de dado pessoal — corpo de mensagem é conteúdo real do
--    profissional/cliente. 'completed' já zera na hora (finish acima);
--    'failed' retém por até 7 dias (janela pra investigação/suporte
--    manual) e então é zerado aqui, mantendo status/erro/timestamps
--    pra observabilidade sem reter o conteúdo.
-- ============================================================
create function public.purge_expired_professional_self_pending_message_bodies(p_older_than_days integer default 7)
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

  update public.professional_self_pending_messages
  set body = null, updated_at = now()
  where status = 'failed' and body is not null and updated_at < now() - make_interval(days => p_older_than_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_professional_self_pending_message_bodies from public;
grant execute on function public.purge_expired_professional_self_pending_message_bodies to service_role;
revoke execute on function public.purge_expired_professional_self_pending_message_bodies from anon, authenticated;
