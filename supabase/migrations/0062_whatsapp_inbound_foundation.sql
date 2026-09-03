-- Doopla Intelligence OS v1 — WhatsApp Inbound Foundation.
--
-- Fecha o achado da auditoria: hoje um contato novo (sem identidade
-- resolvida) é descartado pelo webhook, e create_conversation não
-- pode ser chamada por service_role. Princípio: mensagem recebida →
-- preservada imediatamente → identidade/representação resolvida →
-- conversa correta → Runtime. Nenhuma conversation de representação
-- nasce antes de sabermos quem está sendo representado — routing vive
-- em tabelas próprias, nunca contamina conversations.
--
-- Minimização (LGPD): channel_inbound_intake_messages guarda só o que
-- é estritamente necessário (corpo, canal, identificador, timestamp
-- do provider) — nunca o payload bruto do webhook.
--
-- Runtime (src/lib/runtime/, src/lib/intelligence/) não é tocado por
-- esta migration — só duas functions ganham uma extensão ADITIVA
-- (create_conversation, persist_inbound_message), nunca uma reescrita
-- de comportamento existente.

-- ============================================================
-- 1. conversation_messages ganha origin_intake_id — liga uma mensagem
--    materializada de volta à linha exata de channel_inbound_intake_messages
--    que a originou (nullable: a imensa maioria das mensagens nunca
--    passa por intake, identidade já é conhecida).
-- ============================================================
alter table public.conversation_messages
  add column origin_intake_id uuid;

comment on column public.conversation_messages.origin_intake_id is 'Preenchido só quando a mensagem nasceu de uma resolução de WhatsApp Inbound Foundation (channel_inbound_intake_messages.id) — nunca no caminho comum de identidade já conhecida. Fecha a cadeia causal provider event -> inbound_event -> intake -> conversation_message.';

-- ============================================================
-- 2. channel_inbound_intakes — sessão de routing por (channel,
--    from_identifier). No máximo UMA pending_disambiguation por par,
--    garantido por índice único parcial — evita 3 mensagens confusas
--    do mesmo telefone abrindo 3 sessões paralelas.
-- ============================================================
create table public.channel_inbound_intakes (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'email', 'painel', 'public_link', 'outro')),
  from_identifier text not null,
  contact_display_name text,

  routing_status text not null default 'pending_disambiguation'
    check (routing_status in ('pending_disambiguation', 'resolved', 'abandoned')),
  resolution_method text check (resolution_method in ('verified_professional', 'token', 'unique_history', 'client_confirmation')),
  resolved_external_participant_id uuid references public.external_participants (id) on delete restrict,
  resolved_conversation_id uuid references public.conversations (id) on delete restrict,

  -- Prompt de desambiguação ATUALMENTE válido — identidade/versão
  -- mínima pedida: current_prompt_id é regenerado a cada novo prompt
  -- enviado, nunca reaproveitado. Uma resposta só resolve contra o
  -- que está gravado AQUI, lido fresco (sob lock lógico da própria
  -- UPDATE condicional de resolve_channel_inbound_intake) — nunca uma
  -- cópia potencialmente obsoleta. Isso é o que impede uma resposta
  -- atrasada a um prompt já substituído de resolver a sessão errada.
  current_prompt_id uuid,
  current_prompt_options jsonb,
  current_prompt_sent_at timestamptz,

  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  abandoned_at timestamptz,

  check (routing_status <> 'resolved' or (resolved_external_participant_id is not null and resolved_conversation_id is not null and resolution_method is not null))
);

comment on table public.channel_inbound_intakes is 'WhatsApp Inbound Foundation — sessão de resolução de identidade/representação para um contato ainda não vinculado a nenhum profissional. Nunca uma conversations: representação só nasce depois de resolvido (routing_status=resolved). Retenção: linhas resolved podem ter o corpo das mensagens filhas nulado após auditoria (mecanismo de purge fica para bloco futuro — timestamps já preparados aqui).';

create unique index channel_inbound_intakes_pending_unique_idx
  on public.channel_inbound_intakes (channel, from_identifier)
  where routing_status = 'pending_disambiguation';

create index channel_inbound_intakes_from_idx on public.channel_inbound_intakes (channel, from_identifier);

create trigger set_updated_at before update on public.channel_inbound_intakes
  for each row execute function public.set_updated_at();

alter table public.channel_inbound_intakes enable row level security;
-- Sem policy pra authenticated/anon — estado interno de resolução de
-- identidade, mesmo padrão de inbound_events. service_role bypassa RLS.

-- ============================================================
-- 3. channel_inbound_intake_messages — N mensagens por sessão. Cada
--    uma ligada ao seu inbound_event_id (idempotência herdada de
--    graça via FK única — nunca reimplementada aqui). Minimização:
--    só corpo/canal/timestamp do provider, nunca o payload bruto.
-- ============================================================
create table public.channel_inbound_intake_messages (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.channel_inbound_intakes (id) on delete cascade,
  inbound_event_id uuid not null unique references public.inbound_events (id) on delete restrict,

  content_type text not null default 'text' check (content_type in ('text', 'audio', 'attachment')),
  body text,
  provider_sent_at timestamptz,

  -- Preenchido atomicamente por materialize_channel_inbound_intake_message
  -- (junto com o INSERT em conversation_messages, mesma transação) —
  -- guard de idempotência por MENSAGEM: um retry depois de crash
  -- nunca materializa a mesma mensagem duas vezes.
  materialized_conversation_message_id uuid references public.conversation_messages (id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.channel_inbound_intake_messages is 'WhatsApp Inbound Foundation — uma linha por mensagem recebida enquanto a sessão de intake não resolve. Ordem causal real é (provider_sent_at, created_at) — nunca reordenado por inferência. materialized_conversation_message_id nulo = ainda não replicada em conversation_messages.';

create index channel_inbound_intake_messages_intake_idx
  on public.channel_inbound_intake_messages (intake_id, provider_sent_at, created_at);
create index channel_inbound_intake_messages_unmaterialized_idx
  on public.channel_inbound_intake_messages (intake_id) where materialized_conversation_message_id is null;

alter table public.channel_inbound_intake_messages enable row level security;
-- Mesmo padrão: sem policy pra authenticated/anon.

-- ============================================================
-- 4. create_conversation — extensão ADITIVA: is_system_caller() OU
--    auth.uid(), nunca substituindo o caminho autenticado existente
--    (mesmo idioma já usado em try_classify_communicated_proposal,
--    0053). Ramo de sistema é idempotente sob advisory lock por
--    (professional_id, external_participant_id) — nunca cria duas
--    conversas pro mesmo par sob concorrência (duas mensagens quase
--    simultâneas do mesmo contato novo).
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
  v_is_system boolean;
  v_lock_key bigint;
begin
  v_is_system := public.is_system_caller();

  -- Caminho humano autenticado: inalterado, continua exigindo
  -- auth.uid() = p_represented_professional_id. Caminho de sistema
  -- (service_role, ex.: webhook resolvendo um intake): condição
  -- ADICIONAL, nunca uma segunda forma de um client comum se passar
  -- por outro profissional — is_system_caller() só é verdadeiro com o
  -- role real do JWT emitido pelo próprio Supabase Auth, nunca
  -- forjável por authenticated/anon.
  if not v_is_system and auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

  -- Idempotência do ramo de sistema: reaproveita se já existir QUALQUER
  -- conversa pro mesmo par (professional, participante) — checagem
  -- simplificada de propósito (o chamador, no caso do WhatsApp Inbound
  -- Foundation, só chega aqui depois de já ter confirmado via leitura
  -- própria que nada é reaproveitável pelas regras de negócio de
  -- findReusableWhatsappConversation; este lock só fecha a CORRIDA
  -- entre duas chamadas concorrentes pro mesmo par, não reimplementa
  -- a regra de terminalidade de commercial root).
  if v_is_system and p_external_participant_id is not null then
    v_lock_key := hashtextextended(p_represented_professional_id::text || '|' || p_external_participant_id::text, 44);
    perform pg_advisory_xact_lock(v_lock_key);

    select * into v_conversation
    from public.conversations
    where represented_professional_id = p_represented_professional_id
      and external_participant_id = p_external_participant_id
    order by created_at desc
    limit 1;

    if found then
      return v_conversation;
    end if;
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

  insert into public.conversation_mandate_events (
    conversation_id, previous_mandate, new_mandate, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_mandate, 'conversa criada', case when v_is_system then 'system' else 'professional' end, auth.uid()
  );

  insert into public.conversation_state_events (
    conversation_id, previous_state, new_state, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_state, 'conversa criada', case when v_is_system then 'system' else 'professional' end, auth.uid()
  );

  return v_conversation;
end;
$$;

comment on function public.create_conversation is 'Único caminho de criação de conversation. Estendida (0062) com is_system_caller() — condição ADICIONAL a auth.uid(), nunca substituindo. Ramo de sistema idempotente sob advisory lock por (professional_id, external_participant_id) — nunca cria duas conversas pro mesmo par sob concorrência. Sempre gera, na mesma transação, a linha da conversa e os dois eventos de nascimento.';

-- grants inalterados (já era authenticated; service_role já tinha
-- EXECUTE via pg_default_acl deste projeto, comportamento novo só
-- passa a ser aceito pela LÓGICA interna, nunca por um grant novo).

-- ============================================================
-- 5. persist_inbound_message — extensão ADITIVA: p_origin_intake_id
--    opcional, nunca muda o comportamento dos chamadores existentes
--    (default null). DROP explícito da assinatura antiga primeiro —
--    CREATE OR REPLACE não substitui quando a lista de parâmetros
--    muda (viraria um segundo overload ambíguo pro PostgREST e pra
--    chamadas internas, achado real desta migration).
-- ============================================================
drop function if exists public.persist_inbound_message(uuid, text, uuid, uuid, text, text, text);

create function public.persist_inbound_message(
  p_conversation_id uuid,
  p_author_type text,
  p_author_profile_id uuid,
  p_author_external_participant_id uuid,
  p_channel text,
  p_content_type text,
  p_body text,
  p_origin_intake_id uuid default null
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
    channel, content_type, body, generated_by, origin_intake_id
  ) values (
    p_conversation_id, 'inbound', p_author_type,
    case when p_author_type = 'professional' then p_author_profile_id else null end,
    case when p_author_type = 'external_participant' then p_author_external_participant_id else null end,
    p_channel, p_content_type, p_body, 'human', p_origin_intake_id
  )
  returning * into v_message;

  update public.conversations set last_activity_at = now() where id = p_conversation_id;

  return v_message;
end;
$$;

comment on function public.persist_inbound_message is 'Orchestrator/Runtime — único caminho de escrita de mensagem inbound de EXTERNAL_PARTICIPANT (a RLS de conversation_messages só permite insert direto de mensagem própria do profissional, de propósito, e mesmo essa policy foi fechada em 0061). Estendida (0062) com p_origin_intake_id opcional — liga a mensagem à linha de channel_inbound_intake_messages que a originou, quando aplicável.';

-- ============================================================
-- 6. RPCs de sessão de intake — todas is_system_caller() only, mesmo
--    padrão de privilégio de toda a família runtime_pending_replies/
--    outbound_intents.
-- ============================================================

-- Get-or-create — índice único parcial garante que a corrida (2
-- mensagens novas quase simultâneas do mesmo telefone) nunca cria 2
-- sessões: a segunda tentativa de INSERT bate no unique_violation,
-- capturado, e re-seleciona a linha que a primeira já criou.
create function public.claim_or_create_channel_inbound_intake(
  p_channel text,
  p_from_identifier text,
  p_contact_display_name text default null
)
returns public.channel_inbound_intakes
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.channel_inbound_intakes;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.channel_inbound_intakes
  where channel = p_channel and from_identifier = p_from_identifier and routing_status = 'pending_disambiguation';
  if found then
    if p_contact_display_name is not null and v_row.contact_display_name is null then
      update public.channel_inbound_intakes set contact_display_name = p_contact_display_name where id = v_row.id
      returning * into v_row;
    end if;
    return v_row;
  end if;

  begin
    insert into public.channel_inbound_intakes (channel, from_identifier, contact_display_name)
    values (p_channel, p_from_identifier, p_contact_display_name)
    returning * into v_row;
    return v_row;
  exception when unique_violation then
    select * into v_row from public.channel_inbound_intakes
    where channel = p_channel and from_identifier = p_from_identifier and routing_status = 'pending_disambiguation';
    return v_row;
  end;
end;
$$;

revoke all on function public.claim_or_create_channel_inbound_intake from public;
grant execute on function public.claim_or_create_channel_inbound_intake to service_role;
revoke execute on function public.claim_or_create_channel_inbound_intake from anon, authenticated;

-- Append — idempotente por natureza: inbound_event_id é UNIQUE, uma
-- reentrega do mesmo evento (já teria sido barrada por claim_inbound_event
-- antes de chegar aqui, mas defesa em profundidade) nunca duplica linha.
create function public.append_channel_inbound_intake_message(
  p_intake_id uuid,
  p_inbound_event_id uuid,
  p_body text,
  p_content_type text default 'text',
  p_provider_sent_at timestamptz default null
)
returns public.channel_inbound_intake_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.channel_inbound_intake_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.channel_inbound_intake_messages where inbound_event_id = p_inbound_event_id;
  if found then
    return v_row;
  end if;

  insert into public.channel_inbound_intake_messages (intake_id, inbound_event_id, body, content_type, provider_sent_at)
  values (p_intake_id, p_inbound_event_id, p_body, p_content_type, p_provider_sent_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.append_channel_inbound_intake_message from public;
grant execute on function public.append_channel_inbound_intake_message to service_role;
revoke execute on function public.append_channel_inbound_intake_message from anon, authenticated;

-- set_channel_inbound_intake_prompt — identidade/versão mínima do
-- prompt ATIVO. Regenerar current_prompt_id a cada chamada é o que
-- torna uma resposta a um prompt anterior estruturalmente não-casável
-- depois que este roda de novo.
create function public.set_channel_inbound_intake_prompt(
  p_intake_id uuid,
  p_options jsonb
)
returns public.channel_inbound_intakes
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.channel_inbound_intakes;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.channel_inbound_intakes
  set current_prompt_id = gen_random_uuid(),
      current_prompt_options = p_options,
      current_prompt_sent_at = now(),
      attempt_count = attempt_count + 1
  where id = p_intake_id and routing_status = 'pending_disambiguation'
  returning * into v_row;

  if not found then
    raise exception 'intake_not_pending' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_channel_inbound_intake_prompt from public;
grant execute on function public.set_channel_inbound_intake_prompt to service_role;
revoke execute on function public.set_channel_inbound_intake_prompt from anon, authenticated;

create function public.mark_channel_inbound_intake_abandoned(p_intake_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.channel_inbound_intakes
  set routing_status = 'abandoned', abandoned_at = now()
  where id = p_intake_id and routing_status = 'pending_disambiguation';

  return found;
end;
$$;

revoke all on function public.mark_channel_inbound_intake_abandoned from public;
grant execute on function public.mark_channel_inbound_intake_abandoned to service_role;
revoke execute on function public.mark_channel_inbound_intake_abandoned from anon, authenticated;

-- resolve_channel_inbound_intake — claim atômico (UPDATE...WHERE
-- routing_status=pending_disambiguation), mesmo idioma de
-- resolve_runtime_pending_reply_allowed. Sob corrida (duas tentativas
-- de resolução concorrentes, ex.: dois workers), só uma vence a
-- UPDATE; a outra recebe found=false e deve reler a linha (já
-- resolvida pela vencedora) — nunca cria uma segunda conversa/participante
-- por conta própria (a criação em si já é idempotente via
-- create_conversation/resolve_or_create_external_participant, então
-- as duas tentativas convergem pro mesmo resultado de qualquer forma).
create function public.resolve_channel_inbound_intake(
  p_intake_id uuid,
  p_resolution_method text,
  p_external_participant_id uuid,
  p_conversation_id uuid
)
returns table (claimed boolean, intake public.channel_inbound_intakes)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.channel_inbound_intakes;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_resolution_method not in ('verified_professional', 'token', 'unique_history', 'client_confirmation') then
    raise exception 'invalid_resolution_method' using errcode = '22023';
  end if;

  update public.channel_inbound_intakes
  set routing_status = 'resolved',
      resolution_method = p_resolution_method,
      resolved_external_participant_id = p_external_participant_id,
      resolved_conversation_id = p_conversation_id,
      resolved_at = now()
  where id = p_intake_id and routing_status = 'pending_disambiguation'
  returning * into v_row;

  if found then
    return query select true, v_row;
    return;
  end if;

  -- Já resolvida (por esta mesma tentativa reprocessada, ou por uma
  -- corrida perdida) — retorna o estado atual, nunca erro, nunca
  -- tenta resolver de novo.
  select * into v_row from public.channel_inbound_intakes where id = p_intake_id;
  return query select false, v_row;
end;
$$;

revoke all on function public.resolve_channel_inbound_intake from public;
grant execute on function public.resolve_channel_inbound_intake to service_role;
revoke execute on function public.resolve_channel_inbound_intake from anon, authenticated;

-- materialize_channel_inbound_intake_message — atômico: lock da linha
-- + persist_inbound_message (chamada aninhada, mesma transação) +
-- gravação do id resultante + fechamento do inbound_event
-- correspondente, tudo ou nada. Um crash a meio nunca deixa
-- persist_inbound_message rodado sem o rastro gravado — retry
-- encontra materialized_conversation_message_id ainda nulo (única
-- fonte de verdade de "já processei isto") e nunca reprocessa uma
-- linha cujo id já foi gravado.
create function public.materialize_channel_inbound_intake_message(
  p_intake_message_id uuid,
  p_conversation_id uuid,
  p_external_participant_id uuid,
  p_channel text
)
returns public.conversation_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_intake_msg public.channel_inbound_intake_messages;
  v_message public.conversation_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_intake_msg from public.channel_inbound_intake_messages where id = p_intake_message_id for update;
  if not found then
    raise exception 'intake_message_not_found' using errcode = 'P0002';
  end if;

  if v_intake_msg.materialized_conversation_message_id is not null then
    select * into v_message from public.conversation_messages where id = v_intake_msg.materialized_conversation_message_id;
    return v_message;
  end if;

  v_message := public.persist_inbound_message(
    p_conversation_id, 'external_participant', null, p_external_participant_id,
    p_channel, coalesce(v_intake_msg.content_type, 'text'), v_intake_msg.body, p_intake_message_id
  );

  update public.channel_inbound_intake_messages
  set materialized_conversation_message_id = v_message.id
  where id = p_intake_message_id;

  perform public.finish_inbound_event(v_intake_msg.inbound_event_id, 'processed', v_message.id);

  return v_message;
end;
$$;

revoke all on function public.materialize_channel_inbound_intake_message from public;
grant execute on function public.materialize_channel_inbound_intake_message to service_role;
revoke execute on function public.materialize_channel_inbound_intake_message from anon, authenticated;
