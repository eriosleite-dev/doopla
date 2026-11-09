-- Doopla Intelligence Core v1 — Runtime: Fase 0 do AI Engineering
-- Charter, achado real de auditoria (investigação do Head of AI sobre
-- recuperação de inbound_events falhos, ADR 0002). Dois gaps
-- distintos, fechados juntos porque qualquer mecanismo de retomada
-- automática (Fase 1, ainda não autorizada) depende dos dois:
--
-- 1) conversation_messages não tinha NENHUMA defesa contra reprocessar
--    o MESMO wamid duas vezes (ex.: nosso próprio worker reexecuta a
--    identidade/persistência depois de uma falha parcial — não é
--    sobre o webhook do Meta reentregar o batch, isso já é protegido
--    por claim_inbound_event desde a 0051, é sobre NÓS tentarmos de
--    novo "do zero").
-- 2) outbound_intents não tinha NENHUMA defesa contra criar um
--    segundo envio comercial real pro mesmo trigger_message_id —
--    achado mais grave: sem isso, qualquer retry de pipeline depois
--    de falha pós-outbound-intent arrisca mandar a mesma mensagem
--    duas vezes pro cliente.
--
-- As DUAS correções seguem o mesmo molde: UNIQUE INDEX parcial (nunca
-- bloqueia os fluxos que não têm o identificador — delegação sempre
-- passa trigger_message_id=null, canais sem wamid sempre passam
-- provider_message_id=null) + "insert ... on conflict ... do nothing"
-- com fallback de SELECT da linha já existente. Nunca um unique
-- constraint nu: uma segunda tentativa tem que ENCONTRAR e REUSAR a
-- linha original, nunca só receber um erro de violação e deixar quem
-- chamou preso (exigência explícita da fundadora/Head of AI).

-- =====================================================================
-- 1. conversation_messages.provider_message_id — mesmo nome e mesmo
--    propósito ("identificador do provedor pra esta mensagem
--    específica") já usado em outbound_intents.provider_message_id
--    (0051) e em inbound_events (channel, provider_event_id, 0051) —
--    nunca confundir os três: este aqui é o wamid da mensagem INBOUND
--    persistida, não o wamid de um envio nosso nem o id do evento bruto
--    do webhook.
-- =====================================================================

alter table public.conversation_messages
  add column provider_message_id text;

comment on column public.conversation_messages.provider_message_id is 'Identificador do provedor pra esta mensagem inbound específica (wamid, no caso do WhatsApp) — null pra canais sem esse conceito (painel, email, public_link, outro) ou pra mensagens antigas (coluna aditiva, nunca retroativamente preenchida). Existe pra dar a persist_inbound_message (0111) uma chave de deduplicação real: evita duplicar a linha se o nosso próprio pipeline reprocessar o mesmo wamid do zero depois de uma falha parcial (cenário diferente de reentrega de webhook do Meta, já coberto por claim_inbound_event desde 0051).';

create unique index conversation_messages_one_per_provider_message_idx
  on public.conversation_messages (channel, provider_message_id)
  where provider_message_id is not null;

-- persist_inbound_message — assinatura estendida (10º parâmetro),
-- precisa de drop explícito (mesmo cuidado já usado nas extensões
-- anteriores desta function, 0062 e 0066: create or replace NUNCA
-- substitui quando a ARIDADE muda, cria um segundo overload
-- silencioso em vez disso). Assinatura anterior (0098): (uuid, text,
-- uuid, uuid, text, text, text, uuid, uuid).
drop function if exists public.persist_inbound_message(uuid, text, uuid, uuid, text, text, text, uuid, uuid);

create function public.persist_inbound_message(
  p_conversation_id uuid,
  p_author_type text,
  p_author_profile_id uuid,
  p_author_external_participant_id uuid,
  p_channel text,
  p_content_type text,
  p_body text,
  p_origin_intake_id uuid default null,
  p_replied_to_outbound_intent_id uuid default null,
  p_provider_message_id text default null
)
returns public.conversation_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_message public.conversation_messages;
  v_outbound public.outbound_intents;
  v_prepared_response_outcome text;
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

  if p_replied_to_outbound_intent_id is not null then
    if p_author_type <> 'professional' then
      raise exception 'replied_to_outbound_intent_requires_professional_author' using errcode = '22023';
    end if;

    select * into v_outbound from public.outbound_intents where id = p_replied_to_outbound_intent_id;
    if v_outbound is null then
      raise exception 'outbound_intent_not_found' using errcode = 'P0002';
    end if;
    if v_outbound.conversation_id is distinct from p_conversation_id then
      raise exception 'outbound_intent_conversation_mismatch' using errcode = '22023';
    end if;

    if public.normalize_prepared_response_text(v_outbound.content) = public.normalize_prepared_response_text(p_body) then
      v_prepared_response_outcome := 'sent';
    else
      v_prepared_response_outcome := 'edited';
    end if;

    -- Fecha o draft original — mesma transação do INSERT abaixo
    -- (atomicidade por construção). Nunca toca num draft que não bata
    -- 100% nas 4 condições; nunca levanta exceção se não bater (a
    -- mensagem sempre é persistida, esta é só a limpeza do lado).
    update public.outbound_intents
    set delivery_state = 'cancelled', failure_reason = 'superseded_by_professional_reply', updated_at = now()
    where id = p_replied_to_outbound_intent_id
      and conversation_id = p_conversation_id
      and professional_id = p_author_profile_id
      and requires_professional_review = true
      and delivery_state in ('policy_allowed', 'queued');
  end if;

  if v_conv.external_participant_id is null and p_author_type = 'external_participant' then
    update public.conversations set external_participant_id = p_author_external_participant_id where id = p_conversation_id;
  end if;

  -- Idempotência real (0111, achado da auditoria de recuperação de
  -- inbound_events): se p_provider_message_id já foi persistido pra
  -- este canal, o INSERT abaixo não cria uma segunda linha — devolve
  -- a linha JÁ CRIADA na tentativa original, nunca duplica a mensagem
  -- do cliente, nunca lança erro pra quem chamou (quem chamou só quer
  -- "a mensagem está persistida", seja esta a primeira tentativa ou
  -- um retry). Os efeitos colaterais acima (fechar outbound_intent
  -- superseded, vincular external_participant_id) são, cada um, por
  -- construção, seguros de repetir: o UPDATE do outbound_intent só
  -- afeta linha que ainda esteja em policy_allowed/queued (já virou
  -- no-op se uma tentativa anterior já tiver fechado), e o UPDATE de
  -- external_participant_id regrava o mesmo valor. Atômico sob
  -- concorrência real (ON CONFLICT, nunca um SELECT-depois-INSERT que
  -- deixaria uma janela de corrida entre dois workers).
  insert into public.conversation_messages (
    conversation_id, direction, author_type, author_profile_id, author_external_participant_id,
    channel, content_type, body, generated_by, origin_intake_id,
    replied_to_outbound_intent_id, prepared_response_outcome, provider_message_id
  ) values (
    p_conversation_id, 'inbound', p_author_type,
    case when p_author_type = 'professional' then p_author_profile_id else null end,
    case when p_author_type = 'external_participant' then p_author_external_participant_id else null end,
    p_channel, p_content_type, p_body, 'human', p_origin_intake_id,
    p_replied_to_outbound_intent_id, v_prepared_response_outcome, p_provider_message_id
  )
  on conflict (channel, provider_message_id) where provider_message_id is not null
  do nothing
  returning * into v_message;

  if v_message.id is null then
    select * into v_message from public.conversation_messages
    where channel = p_channel and provider_message_id = p_provider_message_id;
    return v_message;
  end if;

  update public.conversations set last_activity_at = now() where id = p_conversation_id;

  return v_message;
end;
$$;

comment on function public.persist_inbound_message is 'Orchestrator/Runtime — único caminho de escrita de mensagem inbound de EXTERNAL_PARTICIPANT (a RLS de conversation_messages só permite insert direto de mensagem própria do profissional, de propósito, e mesmo essa policy foi fechada em 0061). Estendida (0062) com p_origin_intake_id opcional. Estendida (Conversas Bloco 2, 0066) com p_replied_to_outbound_intent_id opcional. Estendida (0098, ciclo de requires_professional_review) pra fechar o outbound_intent original respondido. Estendida de novo (0111, idempotência real de recuperação de inbound_events): p_provider_message_id opcional — quando presente e já existir pra este canal, devolve a linha já persistida em vez de duplicar (ON CONFLICT DO NOTHING + fallback SELECT, atômico sob concorrência). Canais sem wamid (painel/email/public_link/outro) continuam passando null — nenhum comportamento muda pra eles.';

revoke all on function public.persist_inbound_message from public;
grant execute on function public.persist_inbound_message to service_role;
revoke execute on function public.persist_inbound_message from anon, authenticated;

-- =====================================================================
-- 2. outbound_intents — o gap mais grave da auditoria: zero defesa
--    contra criar um SEGUNDO envio comercial real pro mesmo
--    trigger_message_id. A "segurança" aparente do caminho de
--    retomada (resumption.ts) vem inteira de
--    runtime_pending_replies.status (claim-once), nunca de
--    outbound_intents — qualquer mecanismo de retry que crie um
--    outbound_intent por fora desse caminho (Fase 1, ainda não
--    autorizada) precisa desta trava existir ANTES.
--
--    Nenhum chamador real hoje passa dois outbound_intents pro mesmo
--    trigger_message_id de propósito — confirmado por leitura de
--    código (resolveOutboundAction em recipient.ts retorna só UM de
--    'create_outbound_intent' | 'persist_ai_message' | 'none', nunca
--    os dois pro mesmo ciclo) — e os 4 call sites reais de
--    create_outbound_intent (pipeline.ts ciclo normal, pipeline.ts
--    cold-outreach, delegated-contact-flow.ts ×2) ou passam um
--    trigger_message_id de uma mensagem inbound real (ciclo normal)
--    ou sempre passam null (cold-outreach e delegação, que não têm
--    trigger inbound) — o índice parcial abaixo nunca bloqueia
--    nenhum desses.
-- =====================================================================

create unique index outbound_intents_one_per_trigger_message_idx
  on public.outbound_intents (trigger_message_id)
  where trigger_message_id is not null;

comment on index public.outbound_intents_one_per_trigger_message_idx is 'Parcial — nunca se aplica a trigger_message_id null (cold-outreach, delegação a terceiro: fluxos sem mensagem inbound disparadora, confirmado por leitura de código, 0111). Fecha o gap mais grave da auditoria de recuperação de inbound_events: sem isso, nada impedia dois outbound_intents reais (dois envios comerciais) pro mesmo gatilho.';

-- create_outbound_intent — mesma assinatura (0083), create or replace
-- basta (só o corpo muda).
create or replace function public.create_outbound_intent(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_run_id uuid,
  p_policy_decision_id uuid,
  p_channel text,
  p_recipient_external_participant_id uuid,
  p_content text,
  p_send_as text default 'free_text',
  p_requires_review boolean default false
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

  -- Idempotência real (0111): se p_trigger_message_id já tem um
  -- outbound_intent (ex.: uma tentativa anterior do ciclo criou com
  -- sucesso, mas o ciclo falhou DEPOIS disso, antes de terminar), o
  -- INSERT abaixo não cria um segundo — devolve a linha JÁ CRIADA,
  -- nunca um segundo envio comercial real pro mesmo cliente. Se
  -- p_content divergir do que está na linha existente (o Planner
  -- gerou um draft diferente na segunda tentativa), a linha existente
  -- SEMPRE vence — ela já é "o que está em voo", nunca sobrescrita por
  -- uma decisão posterior do Planner. Atômico sob concorrência (ON
  -- CONFLICT, nunca SELECT-depois-INSERT).
  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content, send_as, requires_professional_review
  ) values (
    p_conversation_id, v_professional_id, p_trigger_message_id, p_run_id, p_policy_decision_id,
    p_channel, p_recipient_external_participant_id, p_content, p_send_as, p_requires_review
  )
  on conflict (trigger_message_id) where trigger_message_id is not null
  do nothing
  returning * into v_row;

  if v_row.id is null and p_trigger_message_id is not null then
    select * into v_row from public.outbound_intents where trigger_message_id = p_trigger_message_id;
  end if;

  return v_row;
end;
$$;

comment on function public.create_outbound_intent is 'Assinatura estendida em 0083 (p_requires_review). Corpo reescrito em 0111 (idempotência real): p_trigger_message_id repetido nunca cria um segundo outbound_intent — devolve a linha já existente (ON CONFLICT DO NOTHING + fallback SELECT na mesma transação, nunca uma janela de corrida entre dois workers). p_trigger_message_id null (cold-outreach, delegação) continua sempre inserindo, comportamento inalterado.';

revoke all on function public.create_outbound_intent from public;
grant execute on function public.create_outbound_intent to service_role;
revoke execute on function public.create_outbound_intent from anon, authenticated;

-- resolve_runtime_pending_reply_allowed — segundo (e único outro)
-- ponto de escrita direta de outbound_intents, por fora de
-- create_outbound_intent (achado da auditoria: tem a MESMA exposição,
-- precisa da MESMA correção). Mesma assinatura (0083), create or
-- replace basta.
create or replace function public.resolve_runtime_pending_reply_allowed(
  p_pending_reply_id uuid,
  p_new_policy_gate_decision_id uuid,
  p_run_id uuid,
  p_channel text default null,
  p_recipient_external_participant_id uuid default null,
  p_content text default null,
  p_requires_review boolean default false
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

  -- Idempotência real (0111) — mesmo raciocínio de create_outbound_intent:
  -- v_pending.trigger_message_id repetido (ex.: esta function chamada
  -- de novo pro mesmo pending reply depois de um crash a meio do
  -- caminho, antes do UPDATE acima ter commitado da vez anterior —
  -- cenário que o claim de status='pending' acima já deveria prevenir,
  -- mas esta é a defesa em profundidade, nunca uma camada só) nunca
  -- cria um segundo outbound_intent.
  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content, requires_professional_review
  ) values (
    v_pending.conversation_id, v_professional_id, v_pending.trigger_message_id, p_run_id, p_new_policy_gate_decision_id,
    p_channel, p_recipient_external_participant_id, p_content, p_requires_review
  )
  on conflict (trigger_message_id) where trigger_message_id is not null
  do nothing
  returning id into v_intent_id;

  if v_intent_id is null and v_pending.trigger_message_id is not null then
    select id into v_intent_id from public.outbound_intents where trigger_message_id = v_pending.trigger_message_id;
  end if;

  return query select true, v_intent_id;
end;
$$;

comment on function public.resolve_runtime_pending_reply_allowed is 'Assinatura estendida em 0083 (p_requires_review). Corpo reescrito em 0111 (idempotência real): mesma trava de create_outbound_intent aplicada ao INSERT direto que esta function faz (segundo e único outro ponto de escrita de outbound_intents) — v_pending.trigger_message_id repetido nunca cria um segundo outbound_intent.';

revoke all on function public.resolve_runtime_pending_reply_allowed from public;
grant execute on function public.resolve_runtime_pending_reply_allowed to service_role;
revoke execute on function public.resolve_runtime_pending_reply_allowed from anon, authenticated;
