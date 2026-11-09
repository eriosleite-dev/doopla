-- Doopla Intelligence Core v1 — Runtime: Fase 1 do roadmap de
-- confiabilidade do AI Engineering Charter (ADR 0002, seção 1 —
-- escopo mínimo aprovado pela fundadora/Head of AI, 15/10/2026).
--
-- Objetivo: nenhuma mensagem de texto elegível do webhook do WhatsApp
-- desaparece por falha de processamento, mesmo ANTES da resolução de
-- identidade. Fase 0 (migration 0111) já garante que nenhum retry
-- duplica efeito (mensagem/envio comercial); esta migration garante
-- que o CONTEÚDO BRUTO nunca se perde entre a chegada do webhook e o
-- processamento — as duas coisas juntas são o que torna um retry
-- futuro (Fase 2, ainda não implementada) seguro de verdade.
--
-- Escopo explicitamente MÍNIMO desta rodada (autorização da
-- fundadora): só captura durável + processamento best-effort. SEM
-- sweep/retry automático — uma linha presa em 'needs_attention' fica
-- visível (campos de observabilidade abaixo) mas não é retomada
-- sozinha ainda. Fase 3 (retry de prompts de desambiguação) continua
-- bloqueada, intocada.

-- ============================================================
-- 1. whatsapp_inbound_raw_captures — primeira escrita de qualquer
--    mensagem de texto elegível, antes de qualquer roteamento.
--    Mesmo papel de inbound_events (0051) — "nada roda sem passar por
--    aqui primeiro" — mas guarda o CONTEÚDO, que inbound_events nunca
--    guarda (ver nota de minimização abaixo).
-- ============================================================
create table public.whatsapp_inbound_raw_captures (
  id uuid primary key default gen_random_uuid(),

  -- Chave real do provider (wamid) — nunca gerada por nós. Única:
  -- captura é por desenho idempotente a reentrega do mesmo lote pela
  -- Meta (ON CONFLICT DO NOTHING na function abaixo).
  provider_message_id text not null unique,

  -- Dado mínimo pra reconstruir handleWhatsappInboundMessage do zero
  -- (minimização de dados, LGPD) — nunca o payload bruto inteiro da
  -- Meta. Nullable: zerados no sucesso real (ver finish_... abaixo,
  -- mesmo padrão de finish_professional_self_pending_message, 0108) —
  -- só retidos enquanto o processamento não concluiu de verdade.
  from_phone text,
  body text,
  contact_name text,
  provider_timestamp_seconds bigint,

  -- 'delegated' (achado da revisão do Head of AI, 15/10/2026, antes de
  -- aplicar em staging): distinto de 'completed' de propósito.
  -- routed/duplicate_event/backlogged/abandoned pousam numa posição
  -- durável e ESTÁVEL (conversation_messages ou
  -- channel_inbound_intake_messages — nada mais "em voo" pro conteúdo
  -- em si, mesmo que a CONVERSA continue aberta). 'deferred'
  -- (resolveProfessionalSelfAndFinish, intake-orchestration.ts) é
  -- diferente: o conteúdo está em professional_self_pending_messages,
  -- mas essa linha ainda está ATIVAMENTE pending/processing — não
  -- alcançou nem o PRÓPRIO estado terminal. Marcar isso 'completed'
  -- esconderia que ainda há uma tentativa em andamento noutro lugar;
  -- marcar 'needs_attention' sugeriria falha, quando é só uma retomada
  -- normal (drain cron, já testado). 'delegated' nomeia exatamente o
  -- que é: conteúdo durável, responsabilidade formalmente passada pra
  -- outro mecanismo com seu próprio ciclo de retomada.
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'delegated', 'needs_attention')),

  -- Observabilidade (exigência explícita desta rodada: falha
  -- registrada de forma visível, nunca silenciosa) — result_kind
  -- espelha WhatsappInboundHandlerResult['kind'] (intake-orchestration.ts)
  -- quando completed; last_error guarda a mensagem de exceção quando
  -- needs_attention. Nenhum CHECK de enum aqui de propósito — é só
  -- observabilidade, nunca uma regra de negócio reforçada pelo banco.
  result_kind text,
  last_error text,
  attempt_count integer not null default 0,

  -- Claim/lease — mesmo padrão de inbound_events/
  -- professional_self_pending_messages: impede que duas reentregas do
  -- mesmo lote (ou dois workers) processem a MESMA captura em
  -- paralelo. Nunca usado pra um sweep automático nesta rodada (não
  -- implementado ainda, por desenho) — só serializa processamento
  -- concorrente dentro desta fase.
  lease_worker_id text,
  lease_expires_at timestamptz,

  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_inbound_raw_captures is 'Fase 1 (ADR 0002) — captura durável e idempotente de toda mensagem de texto elegível do webhook do WhatsApp, ANTES de qualquer resolução de identidade/roteamento. status=completed (sucesso real, verificado pelo caminho que realmente processou — nunca otimista, conteúdo já numa posição durável e ESTÁVEL: conversation_messages ou channel_inbound_intake_messages) e status=delegated (conteúdo já durável mas noutro mecanismo que AINDA está com uma tentativa ativa em andamento — professional_self_pending_messages, achado da revisão do Head of AI 15/10/2026: nunca confundir com completed) zeram body/from_phone/contact_name na hora (LGPD, ver finish_whatsapp_inbound_raw_capture). status=needs_attention retém o conteúdo até purge_expired_whatsapp_inbound_raw_captures (função definida, SEM cron automático nesta rodada — escopo mínimo, retomada automática fica pra Fase 2). Nunca confundir com inbound_events (0051, só idempotência física, sem conteúdo) nem com outbound_intents.provider_message_id (wamid de um ENVIO nosso, não de uma mensagem recebida).';

create index whatsapp_inbound_raw_captures_status_idx on public.whatsapp_inbound_raw_captures (status, captured_at);

alter table public.whatsapp_inbound_raw_captures enable row level security;
-- Nenhuma policy pra authenticated/anon — estado interno do
-- Orchestrator, mesmo padrão de inbound_events/
-- professional_self_pending_messages. service_role bypassa RLS.

-- ============================================================
-- 2. Captura — idempotente por provider_message_id (upsert-com-reuso,
--    mesmo padrão já estabelecido em 0111: ON CONFLICT DO NOTHING +
--    fallback SELECT, nunca um unique constraint nu). Chamada na
--    Passagem 1 do webhook, pra CADA mensagem elegível do lote, antes
--    de iniciar qualquer roteamento.
-- ============================================================
create function public.capture_whatsapp_inbound_raw_message(
  p_provider_message_id text,
  p_from_phone text,
  p_body text,
  p_contact_name text,
  p_provider_timestamp_seconds bigint default null
)
returns public.whatsapp_inbound_raw_captures
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.whatsapp_inbound_raw_captures;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.whatsapp_inbound_raw_captures (
    provider_message_id, from_phone, body, contact_name, provider_timestamp_seconds
  ) values (
    p_provider_message_id, p_from_phone, p_body, p_contact_name, p_provider_timestamp_seconds
  )
  on conflict (provider_message_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Já capturada (reentrega do mesmo lote pela Meta, ou duas
    -- entregas concorrentes correndo a Passagem 1 ao mesmo tempo) —
    -- devolve a linha já existente, nunca duplica, nunca lança.
    select * into v_row from public.whatsapp_inbound_raw_captures where provider_message_id = p_provider_message_id;
  end if;

  return v_row;
end;
$$;

comment on function public.capture_whatsapp_inbound_raw_message is 'Fase 1 (ADR 0002) — Passagem 1 do webhook. Idempotente por provider_message_id: reentrega do lote pela Meta, ou duas entregas concorrentes, nunca duplicam a captura (ON CONFLICT DO NOTHING + fallback SELECT, atômico). Se esta function falhar (exceção), o chamador deve devolver HTTP 503 pro LOTE inteiro — nunca prosseguir pra Passagem 2 com uma mensagem ainda não capturada.';

revoke all on function public.capture_whatsapp_inbound_raw_message from public;
grant execute on function public.capture_whatsapp_inbound_raw_message to service_role;
revoke execute on function public.capture_whatsapp_inbound_raw_message from anon, authenticated;

-- ============================================================
-- 3. Claim — controle de concorrência POR CAPTURA (exigência explícita
--    desta rodada): impede que duas reentregas processem a MESMA
--    mensagem em paralelo na Passagem 2. Só reclama 'pending' ou
--    'processing' com lease vencida (worker travado/crashado nunca
--    bloqueia a linha pra sempre) — nunca reclama 'completed'/
--    'needs_attention' (terminal nesta fase, sem sweep).
-- ============================================================
create function public.claim_whatsapp_inbound_raw_capture_for_processing(
  p_provider_message_id text,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (claimed boolean, capture_id uuid, attempt_count integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.whatsapp_inbound_raw_captures;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Alias + qualificação explícita (c.attempt_count): a assinatura de
  -- retorno desta function (RETURNS TABLE com uma coluna de saída
  -- também chamada attempt_count) cria uma variável PL/pgSQL com o
  -- MESMO NOME da coluna — sem qualificar, "attempt_count + 1" é
  -- ambíguo entre a variável e a coluna (achado real de teste local,
  -- Postgres recusa a function nessa forma).
  update public.whatsapp_inbound_raw_captures as c
  set status = 'processing', lease_worker_id = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = c.attempt_count + 1, updated_at = now()
  where c.provider_message_id = p_provider_message_id
    and (c.status = 'pending' or (c.status = 'processing' and c.lease_expires_at < now()))
  returning c.* into v_row;

  if v_row.id is null then
    -- Não reclamada: já 'completed'/'needs_attention' (nada a fazer),
    -- ou outra entrega tem a lease viva AGORA (está processando de
    -- verdade neste exato momento) — nos dois casos, o chamador nunca
    -- deve rodar a Passagem 2 pra esta mensagem nesta tentativa.
    return query select false, null::uuid, null::integer;
    return;
  end if;

  return query select true, v_row.id, v_row.attempt_count;
end;
$$;

comment on function public.claim_whatsapp_inbound_raw_capture_for_processing is 'Fase 1 (ADR 0002) — início da Passagem 2, por mensagem. claimed=false nunca é erro: ou já foi concluída por outra entrega (conteúdo já durável em outro lugar, nada a fazer), ou outra entrega está processando agora (lease viva) — nos dois casos o chamador simplesmente não processa esta mensagem nesta tentativa, sem logar falha. Garante que duas reentregas do mesmo lote (ou duas requisições concorrentes) nunca executem handleWhatsappInboundMessage em paralelo pro MESMO wamid.';

revoke all on function public.claim_whatsapp_inbound_raw_capture_for_processing from public;
grant execute on function public.claim_whatsapp_inbound_raw_capture_for_processing to service_role;
revoke execute on function public.claim_whatsapp_inbound_raw_capture_for_processing from anon, authenticated;

-- ============================================================
-- 4. Finish — três desfechos possíveis, e só a função que RECLAMOU
--    pode terminar (lease_worker_id precisa bater — defesa em
--    profundidade contra um worker zumbi, com a tentativa anterior
--    ainda rodando depois da lease ter expirado e sido reclamada por
--    outro, terminando por cima de um processamento mais novo).
--    'completed'/'delegated' só devem ser chamados quando o CAMINHO
--    que processou a mensagem alcançou um estado durável verificado
--    (nunca otimista) — essa verificação é responsabilidade do
--    chamador (TS), documentada em detalhe no comentário da function.
-- ============================================================
create function public.finish_whatsapp_inbound_raw_capture(
  p_provider_message_id text,
  p_worker_id text,
  p_status text,
  p_result_kind text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'delegated', 'needs_attention') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if p_status in ('completed', 'delegated') then
    update public.whatsapp_inbound_raw_captures
    set status = p_status, result_kind = p_result_kind, last_error = null,
        -- LGPD: o dado só serve pra reconstruir o processamento se ele
        -- falhar. completed já tem o conteúdo em outro lugar durável e
        -- ESTÁVEL (conversation_messages via persist_inbound_message
        -- idempotente, 0111; ou channel_inbound_intake_messages —
        -- ambos já auditados, nunca esta tabela de novo). delegated
        -- também já tem o conteúdo durável, só que em
        -- professional_self_pending_messages, cujo PRÓPRIO ciclo de
        -- retomada (drain cron, já testado) segue responsável por ele
        -- a partir daqui — nunca esta tabela de novo. Nos dois casos,
        -- zera na hora (mesmo padrão de
        -- finish_professional_self_pending_message, 0108).
        from_phone = null, body = null, contact_name = null,
        processed_at = now(), updated_at = now()
    where provider_message_id = p_provider_message_id and status = 'processing' and lease_worker_id = p_worker_id;
  else
    update public.whatsapp_inbound_raw_captures
    set status = 'needs_attention', result_kind = p_result_kind, last_error = p_error,
        processed_at = now(), updated_at = now()
    where provider_message_id = p_provider_message_id and status = 'processing' and lease_worker_id = p_worker_id;
  end if;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.finish_whatsapp_inbound_raw_capture is 'Fase 1 (ADR 0002) — fim da Passagem 2, por mensagem. Só atualiza quando status=processing E lease_worker_id bate com p_worker_id (nunca um worker com lease já vencida/reclamada por outro termina por cima de um processamento mais novo). Contrato do chamador (TS): p_status=completed só depois de handleWhatsappInboundMessage retornar routed (conversation_messages gravado), duplicate_event (já processado antes — seguro aqui porque o claim acima já serializa qualquer concorrência real pro mesmo wamid, então claimed=false só pode significar already_processed=true neste ponto do fluxo) ou backlogged/abandoned (conteúdo já durável e ESTÁVEL em channel_inbound_intake_messages — nada mais em voo pro conteúdo, mesmo que a conversa siga aberta). p_status=delegated (achado da revisão do Head of AI, 15/10/2026) é pra deferred especificamente — conteúdo já durável em professional_self_pending_messages, mas essa linha AINDA está pending/processing (não alcançou nem o próprio estado terminal) — nunca completed, nunca confundido com um sucesso definitivo. Qualquer exceção, ou um retorno não reconhecido, vira needs_attention — nunca completed/delegated por omissão.';

revoke all on function public.finish_whatsapp_inbound_raw_capture from public;
grant execute on function public.finish_whatsapp_inbound_raw_capture to service_role;
revoke execute on function public.finish_whatsapp_inbound_raw_capture from anon, authenticated;

-- ============================================================
-- 5. Retenção de dado pessoal — mesmo raciocínio de
--    purge_expired_professional_self_pending_message_bodies (0108):
--    'needs_attention' retém o conteúdo por uma janela de investigação
--    manual, depois é zerado aqui. Função definida, SEM cron
--    automático nesta rodada (mesmo precedente de 0108 — ver
--    vercel.json: a function de purge equivalente de lá também não
--    tem cron próprio hoje) — escopo mínimo desta fase, intencional,
--    registrado como risco residual no relatório desta rodada.
-- ============================================================
create function public.purge_expired_whatsapp_inbound_raw_captures(p_older_than_days integer default 30)
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

  update public.whatsapp_inbound_raw_captures
  set from_phone = null, body = null, contact_name = null, updated_at = now()
  where status = 'needs_attention' and body is not null and updated_at < now() - make_interval(days => p_older_than_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.purge_expired_whatsapp_inbound_raw_captures is 'Fase 1 (ADR 0002) — retenção de dado pessoal pra captura presa em needs_attention. SEM cron automático nesta rodada (escopo mínimo) — chamar manualmente, ou ligar a um cron, só depois de aprovação separada.';

revoke all on function public.purge_expired_whatsapp_inbound_raw_captures from public;
grant execute on function public.purge_expired_whatsapp_inbound_raw_captures to service_role;
revoke execute on function public.purge_expired_whatsapp_inbound_raw_captures from anon, authenticated;
