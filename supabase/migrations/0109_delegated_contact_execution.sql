-- "Doopla chama o cliente" — Etapa 2.1 (produto, 14/10/2026).
--
-- Aditiva sobre 0104 — nunca substitui o desenho original, só estende.
-- Decisão explícita desta rodada (auditoria antes de escrever este
-- arquivo): migration 0106 (correlação por provider_message_id/wamid)
-- NUNCA foi aplicada em produção (colunas confirmadas ainda uuid) e
-- ficou obsoleta — 0106 contornava o bug de professional_self criar
-- uma conversation NOVA a cada turno, e a 0107 (P0, já aplicada e
-- validada ao vivo) já corrigiu a causa raiz (reaproveita a mesma
-- conversation). Por isso esta migration mantém e estende o desenho
-- original da 0104: uuid, FK real pra conversation_messages, nunca
-- texto solto comparado por igualdade.
--
-- Duas máquinas de estado INDEPENDENTES na mesma linha, cada uma com
-- seu próprio claim/lease/mark — exigência explícita da fundadora
-- (idempotência separada pro template inicial e pra mensagem literal
-- posterior; nenhum retry/webhook duplicado/concorrência pode gerar
-- dois envios da MESMA etapa):
--   1. status (já existia) + execution_worker_id/execution_lease_expires_at
--      (novo) — claim/lease pra criar o outbound_intent do TEMPLATE.
--   2. literal_content_gate (novo, inteiramente separado de status) +
--      literal_content_send_worker_id/literal_content_send_lease_expires_at
--      (novo) — claim/lease pra criar o outbound_intent do TEXTO
--      LITERAL, só depois que o destinatário responder e a checagem de
--      consentimento liberar.

-- ============================================================
-- 0. Novas colunas em pending_delegated_contacts.
-- ============================================================
alter table public.pending_delegated_contacts
  drop constraint pending_delegated_contacts_status_check;
alter table public.pending_delegated_contacts
  add constraint pending_delegated_contacts_status_check
  check (status in (
    'pending_number', 'pending_approval', 'approved',
    -- novo: transitório entre approved e executed — existe só pra dar
    -- um estado visível/reclamável caso o worker caia depois de ganhar
    -- o claim mas antes de terminar de criar participante/conversation/
    -- outbound_intent do template (recuperação pelo sweep, nunca
    -- reenvio cego).
    'executing',
    'rejected', 'cancelled', 'expired',
    -- novo: terminal — template foi enviado, mas o destinatário nunca
    -- respondeu dentro do prazo (ver no_reply_deadline_at). Distinto de
    -- 'expired' (que é só pra pending_approval nunca decidido).
    'expired_no_reply',
    'executed', 'failed'
  ));

comment on column public.pending_delegated_contacts.status is 'pending_number: falta o telefone do destinatário. pending_approval: aguardando sim/não do profissional pro conteúdo exato. approved: claim atômico ganho, execução ainda não iniciada. executing (novo, Etapa 2.1): claim de execução do TEMPLATE ganho, outbound_intent ainda não confirmado criado — estado recuperável por sweep se o worker cair aqui. rejected/cancelled/expired: terminais sem envio. expired_no_reply (novo): template foi enviado (status chegou a executed) mas o destinatário nunca respondeu dentro de no_reply_deadline_at. executed: outbound_intent do template criado (status de entrega real fica em outbound_intents; o que acontece com o TEXTO LITERAL depois disso vive inteiramente em literal_content_gate, nunca aqui). failed: execução do template tentada e falhou antes de criar o outbound_intent.';

alter table public.pending_delegated_contacts
  -- Claim/lease da execução do template — mesmo padrão de
  -- outbound_intents.send_attempt_id/send_lease_expires_at (migration
  -- 0051), só que escopado a este passo específico (criar participante
  -- + conversation + outbound_intent do template), nunca ao envio real
  -- (que outbound_intents já protege sozinho, sem mudança nenhuma).
  add column execution_worker_id text,
  add column execution_lease_expires_at timestamptz,

  -- Prazo de resposta do destinatário (requisito da fundadora: nunca
  -- fica pendente indefinidamente). Gravado no momento em que o
  -- template é confirmado enviado — nunca recalculado depois, nunca
  -- lido de uma constante em runtime (uma mudança futura no prazo
  -- padrão nunca reinterpreta linhas antigas já gravadas com o prazo
  -- vigente na época).
  add column no_reply_deadline_at timestamptz,

  -- Gate do TEXTO LITERAL — máquina de estados própria, nunca reaproveita
  -- `status` (que já termina em 'executed' quando o template sai).
  -- not_applicable é o estado de toda linha que nunca chegou a ser
  -- executada (pending_number/pending_approval/rejected/cancelled/
  -- expired/failed) — só sai desse valor dentro de mark_pending_delegated_contact_executed.
  add column literal_content_gate text not null default 'not_applicable' check (literal_content_gate in (
    'not_applicable',
    -- template enviado, aguardando a 1ª mensagem do destinatário.
    'awaiting_recipient_reply',
    -- 1ª resposta chegou, checagem de consentimento foi AMBÍGUA —
    -- aguardando decisão explícita da profissional (nunca envia
    -- sozinho nesse estado).
    'awaiting_recipient_review',
    -- liberado pra enviar (consentimento ok, OU profissional confirmou
    -- apesar da ambiguidade) — ainda não houve claim de envio.
    'approved_to_send',
    -- 1ª resposta foi uma recusa/pedido de não contato/bloqueio —
    -- terminal, nunca envia.
    'declined_by_recipient',
    -- claim de envio ganho, outbound_intent do texto literal ainda não
    -- confirmado criado — recuperável por sweep.
    'sending',
    -- terminal: outbound_intent do texto literal criado com sucesso.
    'sent',
    -- terminal: tentativa de envio falhou antes de criar o outbound_intent.
    'failed'
  )),

  -- Qual mensagem real do destinatário disparou a checagem de
  -- consentimento — auditoria, nunca usado pra decidir nada sozinho.
  add column recipient_first_reply_message_id uuid references public.conversation_messages (id) on delete set null,

  -- Correlação do SEGUNDO gate (pergunta "destinatário respondeu de
  -- forma ambígua, posso mandar mesmo assim?" pra profissional) — mesmo
  -- padrão do par confirmation_message_id/decision_message_id já
  -- existente pro PRIMEIRO gate (aprovação do pedido), só que
  -- inteiramente separado: um "sim" respondendo a este gate nunca pode
  -- ser confundido com um "sim" respondendo ao gate original (já
  -- resolvido há muito tempo nesse ponto do fluxo).
  add column literal_content_confirmation_message_id uuid references public.conversation_messages (id) on delete set null,
  add column literal_content_decision_message_id uuid references public.conversation_messages (id) on delete set null,

  -- Claim/lease do ENVIO do texto literal — máquina independente da
  -- execution_worker_id/execution_lease_expires_at do template (requisito
  -- explícito: idempotência separada pras duas etapas).
  add column literal_content_send_worker_id text,
  add column literal_content_send_lease_expires_at timestamptz,

  -- outbound_intent do TEXTO LITERAL — sempre distinto de
  -- created_outbound_intent_id (que é só do template, nunca reaproveitado
  -- pras duas finalidades).
  add column literal_content_outbound_intent_id uuid references public.outbound_intents (id) on delete set null;

comment on column public.pending_delegated_contacts.literal_content_gate is 'Máquina de estados independente de `status`, só pro TEXTO LITERAL que a profissional pediu originalmente. not_applicable até o template ser executado; depois disso, awaiting_recipient_reply -> (approved_to_send | declined_by_recipient | awaiting_recipient_review -> approved_to_send/declined_by_recipient) -> sending -> sent/failed. Nunca envia o texto literal fora de approved_to_send -> sending -> sent, sempre por claim atômico.';

-- Duplicidade na ORIGEM (requisito da fundadora): nunca duas
-- solicitações em voo (ainda não decididas) pro mesmo profissional
-- simultaneamente. Escopado só a pending_number/pending_approval de
-- propósito — depois de approved em diante, a própria linha já tem
-- claim/lease cuidando de idempotência; isto aqui é sobre NASCER
-- duplicada, não sobre reexecutar.
create unique index pending_delegated_contacts_one_inflight_request_idx
  on public.pending_delegated_contacts (requesting_professional_id)
  where status in ('pending_number', 'pending_approval');

-- ============================================================
-- 1. claim_pending_delegated_contact_for_template_execution — claim
--    atômico pra iniciar a criação do outbound_intent do TEMPLATE.
--    Mesmo padrão de claim_outbound_intent_for_send (migration 0051):
--    só quem ganha o UPDATE...WHERE segue adiante; um segundo claim
--    concorrente sempre vê granted=false. approved -> executing.
-- ============================================================
create function public.claim_pending_delegated_contact_for_template_execution(
  p_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  granted boolean,
  requesting_professional_id uuid,
  conversation_id uuid,
  recipient_number text,
  recipient_name text,
  draft_message_content text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'executing',
      execution_worker_id = p_worker_id,
      execution_lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  where id = p_id
    and (
      status = 'approved'
      or (status = 'executing' and execution_lease_expires_at < now())
    )
  returning * into v_row;

  if not found then
    return query select false, null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  return query select true, v_row.requesting_professional_id, v_row.conversation_id, v_row.recipient_number, v_row.recipient_name, v_row.draft_message_content;
end;
$$;

comment on function public.claim_pending_delegated_contact_for_template_execution is 'Claim atômico (approved -> executing, ou executing com lease vencida -> nova lease, mesmo worker ou outro) pra criar participante+conversation+outbound_intent do TEMPLATE. Nunca reclama approved/executing com lease ainda válida de outro worker.';

revoke all on function public.claim_pending_delegated_contact_for_template_execution from public;
grant execute on function public.claim_pending_delegated_contact_for_template_execution to service_role;
revoke execute on function public.claim_pending_delegated_contact_for_template_execution from anon, authenticated;

-- ============================================================
-- 2. mark_pending_delegated_contact_executed / _failed — ajuste
--    (create or replace, nunca editando o arquivo 0104 original):
--    fonte passa de 'approved' pra 'executing' (reflete o novo passo
--    intermediário acima). _executed também grava no_reply_deadline_at
--    e abre o gate do texto literal (literal_content_gate ->
--    awaiting_recipient_reply) — unificado aqui porque as duas coisas
--    só fazem sentido juntas, no mesmo commit atômico.
-- ============================================================
-- drop explícito: a assinatura original da 0104 tinha 3 parâmetros
-- (sem p_no_reply_hours) — create or replace nunca substitui uma
-- function quando a lista de parâmetros muda de aridade, ele cria uma
-- SEGUNDA function sobrecarregada com o mesmo nome (achado real deste
-- teste local: comment on function seguinte falhava com "function name
-- is not unique"). Precisa dropar a versão de 3 parâmetros primeiro.
drop function if exists public.mark_pending_delegated_contact_executed(uuid, uuid, uuid);

create function public.mark_pending_delegated_contact_executed(
  p_id uuid,
  p_created_conversation_id uuid,
  p_created_outbound_intent_id uuid,
  p_no_reply_hours integer default 72
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'executed',
      created_conversation_id = p_created_conversation_id,
      created_outbound_intent_id = p_created_outbound_intent_id,
      no_reply_deadline_at = now() + make_interval(hours => p_no_reply_hours),
      literal_content_gate = 'awaiting_recipient_reply',
      resolved_at = now()
  where id = p_id and status = 'executing';

  return found;
end;
$$;

comment on function public.mark_pending_delegated_contact_executed is 'executing -> executed (idempotente: 2ª chamada, incluindo retry pós-crash, não acha linha em executing e devolve false, nunca duplica). p_no_reply_hours default 72 (requisito da fundadora, 14/10/2026) — valor gravado NA LINHA, nunca relido de uma constante em runtime: mudar o padrão depois nunca reinterpreta linhas antigas.';

create or replace function public.mark_pending_delegated_contact_failed(
  p_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'failed', resolved_at = now()
  where id = p_id and status = 'executing';

  return found;
end;
$$;

-- ============================================================
-- 2b. update_pending_delegated_contact_pending_info — permite guardar
--     informação parcial (número e/ou texto do pedido) chegando em
--     turnos SEPARADOS enquanto ainda falta algo, sem avançar pra
--     pending_approval (isso só acontece em
--     prepare_pending_delegated_contact_approval, quando os dois já
--     existem). coalesce: nunca sobrescreve um valor já gravado com
--     null (um turno que só traz o número nunca apaga o texto que já
--     tinha vindo antes, e vice-versa).
-- ============================================================
create function public.update_pending_delegated_contact_pending_info(
  p_id uuid,
  p_recipient_name text default null,
  p_recipient_number text default null,
  p_draft_message_content text default null,
  p_purpose_summary text default null
)
returns public.pending_delegated_contacts
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set recipient_name = coalesce(p_recipient_name, recipient_name),
      recipient_number = coalesce(p_recipient_number, recipient_number),
      draft_message_content = coalesce(p_draft_message_content, draft_message_content),
      purpose_summary = coalesce(p_purpose_summary, purpose_summary)
  where id = p_id and status = 'pending_number'
  returning * into v_row;

  if not found then
    raise exception 'pending_delegated_contact_not_updatable' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_pending_delegated_contact_pending_info from public;
grant execute on function public.update_pending_delegated_contact_pending_info to service_role;
revoke execute on function public.update_pending_delegated_contact_pending_info from anon, authenticated;

-- ============================================================
-- 3. create_delegated_contact_conversation — equivalente a
--    create_conversation (migration 0039/0107) pro caminho de SYSTEM
--    CALLER: create_conversation original exige auth.uid() =
--    p_represented_professional_id (sessão autenticada real) — o fluxo
--    de delegação roda como service_role (mesmo contexto do webhook),
--    que nunca tem auth.uid(). Reaproveita _create_conversation_core
--    (migration 0082, já desenhado pra um segundo chamador confiável)
--    e o MESMO critério de reaproveitamento por (profissional,
--    participante) do ramo 1 de create_conversation — nunca cria uma
--    segunda conversation pro mesmo par em um retry.
-- ============================================================
create function public.create_delegated_contact_conversation(
  p_professional_id uuid,
  p_external_participant_id uuid
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_lock_key bigint;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_lock_key := hashtextextended(p_professional_id::text || '|' || p_external_participant_id::text, 44);
  perform pg_advisory_xact_lock(v_lock_key);

  select * into v_conversation
  from public.conversations
  where represented_professional_id = p_professional_id
    and external_participant_id = p_external_participant_id
  order by created_at desc
  limit 1;

  if found then
    return v_conversation;
  end if;

  return public._create_conversation_core(
    p_represented_professional_id => p_professional_id,
    p_conversation_type => 'external_inquiry',
    p_external_participant_id => p_external_participant_id,
    p_origin => 'professional_delegated',
    p_origin_reference => null,
    p_channel => 'whatsapp',
    p_initial_mandate => 'active',
    p_initial_state => 'novo',
    p_transferred_from_conversation_id => null
  );
end;
$$;

comment on function public.create_delegated_contact_conversation is 'Equivalente de create_conversation (ramo 1, por profissional+participante) pra chamador service_role — create_conversation original exige auth.uid() real, nunca satisfeito pelo fluxo de delegação. Mesma chave de advisory lock (hashtextextended do par), nunca colide com o ramo 1 de create_conversation (mesmo par resolveria pra mesma conversation de qualquer forma, nunca dupla criação).';

revoke all on function public.create_delegated_contact_conversation from public;
grant execute on function public.create_delegated_contact_conversation to service_role;
revoke execute on function public.create_delegated_contact_conversation from anon, authenticated;

-- ============================================================
-- 4. set_pending_delegated_contact_recipient_reply — registra a 1ª
--    resposta real do destinatário e o resultado da checagem de
--    consentimento (feita em código, nunca aqui — esta function só
--    persiste o resultado já decidido). Atômico: 2ª chamada (webhook
--    duplicado processado antes de claimInboundEvent dedupar, ou duas
--    mensagens do destinatário em sequência rápida) nunca reprocessa —
--    só o 1º found=true vale.
-- ============================================================
create function public.set_pending_delegated_contact_recipient_reply(
  p_id uuid,
  p_message_id uuid,
  p_outcome text
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_outcome not in ('proceed', 'declined', 'ambiguous') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  update public.pending_delegated_contacts
  set recipient_first_reply_message_id = p_message_id,
      literal_content_gate = case p_outcome
        when 'proceed' then 'approved_to_send'
        when 'declined' then 'declined_by_recipient'
        else 'awaiting_recipient_review'
      end,
      resolved_at = case when p_outcome = 'declined' then now() else resolved_at end
  where id = p_id
    and status = 'executed'
    and literal_content_gate = 'awaiting_recipient_reply';

  return found;
end;
$$;

comment on function public.set_pending_delegated_contact_recipient_reply is 'Guardado por literal_content_gate=awaiting_recipient_reply — só a PRIMEIRA chamada real vale; qualquer repetição (concorrência, não duplicidade de webhook, que já é resolvida antes disso por claimInboundEvent) encontra o gate já avançado e devolve false, nunca reprocessa a checagem de consentimento duas vezes.';

revoke all on function public.set_pending_delegated_contact_recipient_reply from public;
grant execute on function public.set_pending_delegated_contact_recipient_reply to service_role;
revoke execute on function public.set_pending_delegated_contact_recipient_reply from anon, authenticated;

-- ============================================================
-- 5. prepare_pending_delegated_contact_literal_content_review —
--    grava o id exato da pergunta feita à profissional quando a
--    checagem de consentimento foi ambígua. Mesmo papel de
--    prepare_pending_delegated_contact_approval (0104), só que pro
--    segundo gate.
-- ============================================================
create function public.prepare_pending_delegated_contact_literal_content_review(
  p_id uuid,
  p_confirmation_message_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set literal_content_confirmation_message_id = p_confirmation_message_id,
      literal_content_decision_message_id = null
  where id = p_id and literal_content_gate = 'awaiting_recipient_review';

  return found;
end;
$$;

revoke all on function public.prepare_pending_delegated_contact_literal_content_review from public;
grant execute on function public.prepare_pending_delegated_contact_literal_content_review to service_role;
revoke execute on function public.prepare_pending_delegated_contact_literal_content_review from anon, authenticated;

-- ============================================================
-- 6. claim_pending_delegated_contact_literal_content_decision —
--    mesmo padrão de claim_pending_delegated_contact_decision (0104):
--    exige o confirmation_message_id EXATO. Nunca confundível com uma
--    decisão do PRIMEIRO gate (campos inteiramente separados).
-- ============================================================
-- conversation_id devolvido aqui é SEMPRE created_conversation_id (a
-- conversation EXTERNA, com o destinatário) — nunca
-- pending_delegated_contacts.conversation_id (professional_self, onde
-- o pedido nasceu). Por este ponto do fluxo (literal_content_gate só
-- chega a awaiting_recipient_review depois de status='executed'),
-- created_conversation_id já existe sempre. O chamador (delegated-
-- contact-flow.ts) usa este valor pra criar o outbound_intent do texto
-- literal na conversation certa; pra notificar a profissional, usa
-- pending_delegated_contacts.conversation_id (lido à parte, nunca
-- confundido com este).
create function public.claim_pending_delegated_contact_literal_content_decision(
  p_id uuid,
  p_expected_confirmation_message_id uuid,
  p_decision_message_id uuid,
  p_approved boolean
)
returns table (
  granted boolean,
  requesting_professional_id uuid,
  conversation_id uuid,
  recipient_number text,
  draft_message_content text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set literal_content_gate = case when p_approved then 'approved_to_send' else 'declined_by_recipient' end,
      literal_content_decision_message_id = p_decision_message_id,
      resolved_at = case when not p_approved then now() else resolved_at end
  where id = p_id
    and literal_content_gate = 'awaiting_recipient_review'
    and literal_content_confirmation_message_id = p_expected_confirmation_message_id
  returning * into v_row;

  if not found then
    return query select false, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  return query select true, v_row.requesting_professional_id, v_row.created_conversation_id, v_row.recipient_number, v_row.draft_message_content;
end;
$$;

revoke all on function public.claim_pending_delegated_contact_literal_content_decision from public;
grant execute on function public.claim_pending_delegated_contact_literal_content_decision to service_role;
revoke execute on function public.claim_pending_delegated_contact_literal_content_decision from anon, authenticated;

-- ============================================================
-- 7. claim_pending_delegated_contact_for_literal_content_send — claim
--    atômico, independente do claim do template (item 1). approved_to_send
--    -> sending.
-- ============================================================
-- conversation_id devolvido é SEMPRE created_conversation_id (externa,
-- pra criar o outbound_intent). professional_self_conversation_id
-- (novo, extra) é pending_delegated_contacts.conversation_id — incluído
-- aqui especificamente pra permitir que o sweep de recuperação (cron)
-- notifique a profissional sobre o resultado sem precisar de uma
-- leitura adicional por id (não existe hoje um "get by id" genérico,
-- só os reads já fechados por propósito em migration 0109).
create function public.claim_pending_delegated_contact_for_literal_content_send(
  p_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  granted boolean,
  requesting_professional_id uuid,
  conversation_id uuid,
  professional_self_conversation_id uuid,
  recipient_number text,
  draft_message_content text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set literal_content_gate = 'sending',
      literal_content_send_worker_id = p_worker_id,
      literal_content_send_lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  where id = p_id
    and (
      literal_content_gate = 'approved_to_send'
      or (literal_content_gate = 'sending' and literal_content_send_lease_expires_at < now())
    )
  returning * into v_row;

  if not found then
    return query select false, null::uuid, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  return query select true, v_row.requesting_professional_id, v_row.created_conversation_id, v_row.conversation_id, v_row.recipient_number, v_row.draft_message_content;
end;
$$;

revoke all on function public.claim_pending_delegated_contact_for_literal_content_send from public;
grant execute on function public.claim_pending_delegated_contact_for_literal_content_send to service_role;
revoke execute on function public.claim_pending_delegated_contact_for_literal_content_send from anon, authenticated;

-- ============================================================
-- 8. mark_pending_delegated_contact_literal_content_sent / _failed.
-- ============================================================
create function public.mark_pending_delegated_contact_literal_content_sent(
  p_id uuid,
  p_outbound_intent_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set literal_content_gate = 'sent',
      literal_content_outbound_intent_id = p_outbound_intent_id,
      resolved_at = now()
  where id = p_id and literal_content_gate = 'sending';

  return found;
end;
$$;

revoke all on function public.mark_pending_delegated_contact_literal_content_sent from public;
grant execute on function public.mark_pending_delegated_contact_literal_content_sent to service_role;
revoke execute on function public.mark_pending_delegated_contact_literal_content_sent from anon, authenticated;

create function public.mark_pending_delegated_contact_literal_content_failed(
  p_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set literal_content_gate = 'failed', resolved_at = now()
  where id = p_id and literal_content_gate = 'sending';

  return found;
end;
$$;

revoke all on function public.mark_pending_delegated_contact_literal_content_failed from public;
grant execute on function public.mark_pending_delegated_contact_literal_content_failed to service_role;
revoke execute on function public.mark_pending_delegated_contact_literal_content_failed from anon, authenticated;

-- ============================================================
-- 9. mark_pending_delegated_contact_expired_no_reply — requisito da
--    fundadora: nunca fica pendente indefinidamente quando o
--    destinatário nunca responde ao template.
-- ============================================================
-- Devolve a linha completa (nunca só um booleano) — o chamador (sweep
-- do cron) precisa de requesting_professional_id/conversation_id/
-- recipient_name pra avisar a profissional, sem uma 2ª leitura.
create function public.mark_pending_delegated_contact_expired_no_reply(
  p_id uuid
)
returns public.pending_delegated_contacts
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'expired_no_reply', resolved_at = now()
  where id = p_id
    and status = 'executed'
    and literal_content_gate = 'awaiting_recipient_reply'
    and no_reply_deadline_at < now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.mark_pending_delegated_contact_expired_no_reply from public;
grant execute on function public.mark_pending_delegated_contact_expired_no_reply to service_role;
revoke execute on function public.mark_pending_delegated_contact_expired_no_reply from anon, authenticated;

-- ============================================================
-- 10. Listagens pro sweep (mesmo padrão de list_claimable_outbound_intents/
--     list_professional_self_pending_professionals — sempre via RPC,
--     nunca select direto mesmo com service_role).
-- ============================================================
create function public.list_pending_delegated_contacts_due_for_no_reply_expiry(p_limit integer default 50)
returns setof uuid
language sql
security definer set search_path = public
stable
as $$
  select id from public.pending_delegated_contacts
  where status = 'executed'
    and literal_content_gate = 'awaiting_recipient_reply'
    and no_reply_deadline_at < now()
  order by no_reply_deadline_at
  limit p_limit;
$$;

revoke all on function public.list_pending_delegated_contacts_due_for_no_reply_expiry from public;
grant execute on function public.list_pending_delegated_contacts_due_for_no_reply_expiry to service_role;
revoke execute on function public.list_pending_delegated_contacts_due_for_no_reply_expiry from anon, authenticated;

create function public.list_pending_delegated_contacts_with_expired_execution_lease(p_limit integer default 50)
returns setof uuid
language sql
security definer set search_path = public
stable
as $$
  select id from public.pending_delegated_contacts
  where status = 'executing' and execution_lease_expires_at < now()
  order by execution_lease_expires_at
  limit p_limit;
$$;

revoke all on function public.list_pending_delegated_contacts_with_expired_execution_lease from public;
grant execute on function public.list_pending_delegated_contacts_with_expired_execution_lease to service_role;
revoke execute on function public.list_pending_delegated_contacts_with_expired_execution_lease from anon, authenticated;

create function public.list_pending_delegated_contacts_with_expired_literal_content_lease(p_limit integer default 50)
returns setof uuid
language sql
security definer set search_path = public
stable
as $$
  select id from public.pending_delegated_contacts
  where literal_content_gate = 'sending' and literal_content_send_lease_expires_at < now()
  order by literal_content_send_lease_expires_at
  limit p_limit;
$$;

revoke all on function public.list_pending_delegated_contacts_with_expired_literal_content_lease from public;
grant execute on function public.list_pending_delegated_contacts_with_expired_literal_content_lease to service_role;
revoke execute on function public.list_pending_delegated_contacts_with_expired_literal_content_lease from anon, authenticated;

-- ============================================================
-- 11. Leituras pro recognizer/flow — mesma disciplina de "sempre via
--     RPC, nunca select direto mesmo com service_role" (ver comentário
--     em outbound.ts).
-- ============================================================

-- A mais recente de TODAS (não só não-terminais) — requisito da
-- fundadora: "enviou?" precisa funcionar mesmo depois de a tarefa já
-- ter concluído (ou falhado/expirado), não só enquanto está em voo.
create function public.get_most_recent_pending_delegated_contact(p_professional_id uuid)
returns public.pending_delegated_contacts
language sql
security definer set search_path = public
stable
as $$
  select * from public.pending_delegated_contacts
  where requesting_professional_id = p_professional_id
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_most_recent_pending_delegated_contact from public;
grant execute on function public.get_most_recent_pending_delegated_contact to service_role;
revoke execute on function public.get_most_recent_pending_delegated_contact from anon, authenticated;

-- Pro hook de 1ª resposta do destinatário (pipeline.ts): dado o id da
-- conversation criada pela execução do template, acha a linha (se
-- houver) ainda aguardando essa resposta. Nunca mais de uma linha por
-- conversation nesse estado (created_conversation_id só é setado uma
-- vez, em mark_pending_delegated_contact_executed).
create function public.get_pending_delegated_contact_awaiting_reply_by_conversation(p_conversation_id uuid)
returns public.pending_delegated_contacts
language sql
security definer set search_path = public
stable
as $$
  select * from public.pending_delegated_contacts
  where created_conversation_id = p_conversation_id
    and status = 'executed'
    and literal_content_gate = 'awaiting_recipient_reply'
  limit 1;
$$;

revoke all on function public.get_pending_delegated_contact_awaiting_reply_by_conversation from public;
grant execute on function public.get_pending_delegated_contact_awaiting_reply_by_conversation to service_role;
revoke execute on function public.get_pending_delegated_contact_awaiting_reply_by_conversation from anon, authenticated;

-- ============================================================
-- 12. Proteção de ativação — mesmo padrão já estabelecido em
--     app_settings (migration 0099, billing_kill_switch): fonte de
--     verdade no banco, nunca só uma env var do Next (reativar nunca
--     exige nova migration, só um UPDATE). Nasce 'false': o deploy
--     desta Etapa 2.1 fica no ar com o reconhecedor de pedidos
--     DESLIGADO até o teste controlado — nenhuma mensagem profissional
--     aciona o fluxo novo enquanto isto não virar 'true'. Só o PEDIDO
--     (professional_self) é gateado — uma delegação já aprovada antes
--     de um desligamento futuro continua sendo processada até o fim
--     (nunca abandona um fluxo em andamento por causa da flag).
-- ============================================================
insert into public.app_settings (key, value)
values ('delegated_contact_enabled', 'false')
on conflict (key) do nothing;
