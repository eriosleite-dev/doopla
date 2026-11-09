-- "Doopla chama o cliente" — Etapa 1 (produto, 13/10/2026, aprovado
-- pela fundadora após reconciliação com a Intelligence Core existente).
--
-- Peça ISOLADA e nova — NUNCA reaproveita/altera approval_records,
-- runtime_pending_replies ou policy_gate_decisions. Investigação prévia
-- confirmou que essa máquina existente é estruturalmente amarrada a um
-- commercial_root JÁ existente (booking/opportunity real) e a uma
-- taxonomia fechada de 13 categorias de decisão comercial — nenhuma das
-- duas serve pra "aprovar contato proativo com alguém que ainda não é
-- participante de nenhuma conversa". Esta tabela cobre só esse estado
-- intermediário (pedido do profissional -> aprovação -> execução);
-- depois de executada, a conversa criada é uma external_inquiry comum,
-- 100% do pipeline normal (Intelligence Core, Approval Engine,
-- outbound_intents) se aplica sem nenhuma mudança.
--
-- Mesmo padrão de segurança de runtime_pending_replies (migration
-- 0053): RLS habilitada sem nenhuma policy pra anon/authenticated —
-- só service_role (via is_system_caller(), SECURITY DEFINER) mexe
-- aqui. Nunca exposta a nenhum client/browser.

create table public.pending_delegated_contacts (
  id uuid primary key default gen_random_uuid(),

  requesting_professional_id uuid not null references public.profiles (id) on delete cascade,
  -- Sempre a conversa professional_self onde o pedido foi feito —
  -- nunca a conversa criada com o destinatário (essa só existe depois
  -- de executado, ver created_conversation_id).
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  trigger_message_id uuid not null references public.conversation_messages (id) on delete restrict,

  recipient_name text,
  recipient_number text,
  -- Nunca nulo: é o que garante que o contexto da delegação (quem,
  -- por quê, o que já foi informado) sobrevive e é recuperável quando
  -- o destinatário responder — requisito explícito da fundadora, não
  -- basta estar só no histórico de conversation_messages.
  purpose_summary text not null,
  draft_message_content text,

  -- Correlação da aprovação (requisito da fundadora): a aprovação vale
  -- SÓ pra esta combinação exata de destinatário/número/conteúdo. Se
  -- qualquer um mudar, prepare_pending_delegated_contact_approval emite
  -- um confirmation_message_id NOVO — um "sim" respondendo à pergunta
  -- antiga nunca casa com o novo (claim_pending_delegated_contact_decision
  -- exige o id exato), nunca executa a versão errada.
  confirmation_message_id uuid references public.conversation_messages (id) on delete set null,
  decision_message_id uuid references public.conversation_messages (id) on delete set null,

  status text not null default 'pending_number' check (
    status in ('pending_number', 'pending_approval', 'approved', 'rejected', 'cancelled', 'expired', 'executed', 'failed')
  ),

  -- Só preenchidos em mark_pending_delegated_contact_executed — a
  -- partir daí, QUALQUER status de entrega/leitura vem de
  -- outbound_intents.delivery_state (nunca duplicado aqui).
  created_conversation_id uuid references public.conversations (id) on delete set null,
  created_outbound_intent_id uuid references public.outbound_intents (id) on delete set null,

  expires_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.pending_delegated_contacts is '"Doopla chama o cliente" — pedido do profissional (via professional_self) pra Doopla contatar um terceiro proativamente. Vive só até executed/failed/rejected/cancelled/expired; depois disso, a conversa real (created_conversation_id) é uma external_inquiry comum, sem nenhum estado espelhado aqui.';
comment on column public.pending_delegated_contacts.status is 'pending_number: falta o telefone do destinatário. pending_approval: aguardando sim/não do profissional pro conteúdo exato. approved: claim atômico ganho, execução ainda não confirmada (estado transitório curto). rejected/cancelled/expired: terminais sem envio. executed: conversa+outbound_intent criados (status de entrega real fica em outbound_intents). failed: execução tentada e falhou antes de criar o outbound_intent.';

create index pending_delegated_contacts_professional_status_idx
  on public.pending_delegated_contacts (requesting_professional_id, status);
create index pending_delegated_contacts_conversation_idx
  on public.pending_delegated_contacts (conversation_id, created_at);

alter table public.pending_delegated_contacts enable row level security;
-- Sem policy pra authenticated/anon — estado interno do Orchestrator,
-- mesmo padrão de runtime_pending_replies/inbound_events. service_role
-- bypassa RLS.

-- ============================================================
-- 1. create_pending_delegated_contact — sempre nasce pending_number,
--    mesmo quando o número já veio na mensagem (quem chama decide se
--    já encadeia prepare_pending_delegated_contact_approval na mesma
--    chamada do Runtime — nunca duas fontes de verdade pro estado
--    inicial).
-- ============================================================
create function public.create_pending_delegated_contact(
  p_requesting_professional_id uuid,
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_purpose_summary text,
  p_recipient_name text default null,
  p_recipient_number text default null
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

  insert into public.pending_delegated_contacts (
    requesting_professional_id, conversation_id, trigger_message_id,
    purpose_summary, recipient_name, recipient_number
  ) values (
    p_requesting_professional_id, p_conversation_id, p_trigger_message_id,
    p_purpose_summary, p_recipient_name, p_recipient_number
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_pending_delegated_contact from public;
grant execute on function public.create_pending_delegated_contact to service_role;
revoke execute on function public.create_pending_delegated_contact from anon, authenticated;

-- ============================================================
-- 2. prepare_pending_delegated_contact_approval — (re)grava
--    destinatário/conteúdo e emite uma pergunta de confirmação NOVA.
--    Serve tanto pra 1ª preparação (pending_number -> pending_approval)
--    quanto pra revisão de conteúdo já em pending_approval — sempre
--    reseta decision_message_id (qualquer decisão anterior nunca se
--    aplica ao conteúdo revisado).
-- ============================================================
create function public.prepare_pending_delegated_contact_approval(
  p_id uuid,
  p_recipient_number text,
  p_draft_message_content text,
  p_confirmation_message_id uuid,
  p_expires_in_hours integer default 24
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
  set recipient_number = p_recipient_number,
      draft_message_content = p_draft_message_content,
      confirmation_message_id = p_confirmation_message_id,
      decision_message_id = null,
      status = 'pending_approval',
      expires_at = now() + make_interval(hours => p_expires_in_hours)
  where id = p_id
    and status in ('pending_number', 'pending_approval')
  returning * into v_row;

  if not found then
    raise exception 'pending_delegated_contact_not_preparable' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

revoke all on function public.prepare_pending_delegated_contact_approval from public;
grant execute on function public.prepare_pending_delegated_contact_approval to service_role;
revoke execute on function public.prepare_pending_delegated_contact_approval from anon, authenticated;

-- ============================================================
-- 3. claim_pending_delegated_contact_decision — claim atômico, mesmo
--    padrão de claim_outbound_intent_for_send (migration 0051). Exige
--    o confirmation_message_id EXATO que o chamador leu — se o
--    conteúdo foi revisado no meio (novo confirmation_message_id), um
--    "sim" respondendo à pergunta antiga nunca casa, granted=false.
-- ============================================================
create function public.claim_pending_delegated_contact_decision(
  p_id uuid,
  p_expected_confirmation_message_id uuid,
  p_decision_message_id uuid,
  p_approved boolean
)
returns table (
  granted boolean,
  conversation_id uuid,
  requesting_professional_id uuid,
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
  set status = case when p_approved then 'approved' else 'rejected' end,
      decision_message_id = p_decision_message_id,
      resolved_at = now()
  where id = p_id
    and status = 'pending_approval'
    and confirmation_message_id = p_expected_confirmation_message_id
  returning * into v_row;

  if not found then
    return query select false, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  return query select true, v_row.conversation_id, v_row.requesting_professional_id, v_row.recipient_number, v_row.draft_message_content;
end;
$$;

comment on function public.claim_pending_delegated_contact_decision is 'Nunca reclama fora de pending_approval, nunca sem o confirmation_message_id exato — duas "sim" simultâneos ou um "sim" tardio respondendo conteúdo já revisado sempre resultam em granted=false pra uma das tentativas.';

revoke all on function public.claim_pending_delegated_contact_decision from public;
grant execute on function public.claim_pending_delegated_contact_decision to service_role;
revoke execute on function public.claim_pending_delegated_contact_decision from anon, authenticated;

-- ============================================================
-- 4. cancel_pending_delegated_contact — cancelamento explícito do
--    profissional (nunca confundido com rejeição de UM envio: cancela
--    o pedido inteiro, de qualquer estado não-terminal).
-- ============================================================
create function public.cancel_pending_delegated_contact(
  p_id uuid,
  p_decision_message_id uuid
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
  set status = 'cancelled', decision_message_id = p_decision_message_id, resolved_at = now()
  where id = p_id
    and status in ('pending_number', 'pending_approval');

  return found;
end;
$$;

revoke all on function public.cancel_pending_delegated_contact from public;
grant execute on function public.cancel_pending_delegated_contact to service_role;
revoke execute on function public.cancel_pending_delegated_contact from anon, authenticated;

-- ============================================================
-- 5. expire_stale_pending_delegated_contacts — varredura em lote
--    (chamada pelo mesmo cron de 1min que já processa outbound_intents,
--    Etapa 3). Nunca expira nada fora de pending_approval.
-- ============================================================
create function public.expire_stale_pending_delegated_contacts()
returns setof uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    update public.pending_delegated_contacts
    set status = 'expired', resolved_at = now()
    where status = 'pending_approval' and expires_at < now()
    returning id;
end;
$$;

revoke all on function public.expire_stale_pending_delegated_contacts from public;
grant execute on function public.expire_stale_pending_delegated_contacts to service_role;
revoke execute on function public.expire_stale_pending_delegated_contacts from anon, authenticated;

-- ============================================================
-- 6. mark_pending_delegated_contact_executed / _failed — fecham o
--    ciclo depois do claim. _executed é idempotente por desenho:
--    status só sai de 'approved' aqui, então uma segunda chamada (ex.:
--    retry após crash no meio da execução) acha status já 'executed'
--    e simplesmente não encontra linha pra atualizar (found=false),
--    nunca cria uma segunda conversa/outbound_intent.
-- ============================================================
create function public.mark_pending_delegated_contact_executed(
  p_id uuid,
  p_created_conversation_id uuid,
  p_created_outbound_intent_id uuid
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
      resolved_at = now()
  where id = p_id and status = 'approved';

  return found;
end;
$$;

revoke all on function public.mark_pending_delegated_contact_executed from public;
grant execute on function public.mark_pending_delegated_contact_executed to service_role;
revoke execute on function public.mark_pending_delegated_contact_executed from anon, authenticated;

create function public.mark_pending_delegated_contact_failed(
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
  where id = p_id and status = 'approved';

  return found;
end;
$$;

revoke all on function public.mark_pending_delegated_contact_failed from public;
grant execute on function public.mark_pending_delegated_contact_failed to service_role;
revoke execute on function public.mark_pending_delegated_contact_failed from anon, authenticated;
