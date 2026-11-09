-- Doopla Intelligence Core v1 — Runtime: achado real de auditoria
-- (Sessão Central, P0 de beta). O Post-model Gate (0049) só garante
-- que nenhum COMPROMISSO PROTEGIDO (preço/desconto/disponibilidade/
-- mudança/cancelamento/pagamento) sai sem approval real — isso
-- continua correto e não é tocado aqui. O que faltava: um segundo
-- sinal, já calculado desde o Bloco 4
-- (requiresProfessionalReviewBeforeSend/RuntimeDisposition, ver
-- src/lib/runtime/disposition.ts), nunca sobrevivia até o envio real.
-- answer_with_known_information, por exemplo, pode carregar dado de
-- terceiro (telefone/endereço) e é marcado por esse sinal — mas como
-- nunca era persistido em outbound_intents, o cron real
-- (send-outbound-intents, vercel.json, 1×/min) não tinha como
-- distingui-lo de um draft trivialmente seguro (acknowledge,
-- clarify_ambiguity, etc.) e mandava os dois do mesmo jeito.
--
-- Duas regras diferentes, as DUAS precisam sobreviver até o envio
-- (decisão da fundadora, nunca confundir uma com a outra):
-- 1) compromisso protegido precisa de approval válido (Gate + Approval
--    Engine, já existente, intocado);
-- 2) mensagem marcada requires_professional_review=true não pode ser
--    enviada antes de uma revisão explícita (esta migration).
--
-- Fail-closed por padrão de coluna: requires_professional_review
-- default false preserva 100% do comportamento atual pra todo
-- caminho que ainda não passa o sinal explicitamente — nenhum
-- outbound_intent existente ou futuro sem o parâmetro novo passa a
-- ficar bloqueado por acidente. Quando true, list_claimable_outbound_intents
-- e claim_outbound_intent_for_send nunca reclamam a linha — fica
-- retida até liberação.
--
-- MECANISMO DE LIBERAÇÃO: fora de escopo desta migration, de
-- propósito (decisão da fundadora — não inventar um segundo sistema
-- de aprovação paralelo ao Approval Engine, nem decidir sozinho a UX
-- de liberação, que pode cruzar com a auditoria de "Decisões" da
-- Sessão Painel). Hoje uma linha requires_professional_review=true
-- fica retida indefinidamente — pendência real, registrada em
-- PROGRESS.md, nunca contornada virando false por workaround.

alter table public.outbound_intents
  add column requires_professional_review boolean not null default false;

comment on column public.outbound_intents.requires_professional_review is 'true quando o Planner (Bloco 4, requiresProfessionalReviewBeforeSend/resolveRuntimeDisposition) marcou este draft como precisando de revisão humana antes do envio (ex.: answer_with_known_information — risco de dado de terceiro) — independente do Post-model Gate já ter permitido o CONTEÚDO (nenhum compromisso protegido sem approval, checagem sempre separada). list_claimable_outbound_intents/claim_outbound_intent_for_send nunca reclamam uma linha com isto=true. Mecanismo de liberação (ligar a uma decisão/approval real) ainda não existe nesta rodada — nunca contornar virando false.';

-- create or replace NÃO basta: adicionar um parâmetro novo muda a
-- assinatura (name+arg-types), Postgres criaria um SEGUNDO overload em
-- vez de substituir — mesmo cuidado já documentado na migration 0058
-- (send_as). Assinatura antiga (0058): (uuid, uuid, uuid, uuid, text,
-- uuid, text, text).
drop function if exists public.create_outbound_intent(uuid, uuid, uuid, uuid, text, uuid, text, text);

create function public.create_outbound_intent(
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

  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content, send_as, requires_professional_review
  ) values (
    p_conversation_id, v_professional_id, p_trigger_message_id, p_run_id, p_policy_decision_id,
    p_channel, p_recipient_external_participant_id, p_content, p_send_as, p_requires_review
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_outbound_intent is 'Assinatura estendida nesta rodada (p_requires_review, default false — nenhum chamador existente muda de comportamento). Continua o único ponto de escrita direta de outbound_intents fora de resolve_runtime_pending_reply_allowed (retomada).';

revoke all on function public.create_outbound_intent from public;
grant execute on function public.create_outbound_intent to service_role;
revoke execute on function public.create_outbound_intent from anon, authenticated;

-- resolve_runtime_pending_reply_allowed (0053, reescrita em 0054) —
-- mesmo cuidado de assinatura. Assinatura antiga (0054): (uuid, uuid,
-- uuid, text, uuid, text).
drop function if exists public.resolve_runtime_pending_reply_allowed(uuid, uuid, uuid, text, uuid, text);

create function public.resolve_runtime_pending_reply_allowed(
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

  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content, requires_professional_review
  ) values (
    v_pending.conversation_id, v_professional_id, v_pending.trigger_message_id, p_run_id, p_new_policy_gate_decision_id,
    p_channel, p_recipient_external_participant_id, p_content, p_requires_review
  )
  returning id into v_intent_id;

  return query select true, v_intent_id;
end;
$$;

comment on function public.resolve_runtime_pending_reply_allowed is 'Assinatura estendida nesta rodada (p_requires_review, default false — nenhum chamador existente muda de comportamento).';

revoke all on function public.resolve_runtime_pending_reply_allowed from public;
grant execute on function public.resolve_runtime_pending_reply_allowed to service_role;
revoke execute on function public.resolve_runtime_pending_reply_allowed from anon, authenticated;

-- list_claimable_outbound_intents (0057) — mesma assinatura, create or
-- replace basta (só o corpo muda: nunca lista uma linha travada por
-- revisão pendente).
create or replace function public.list_claimable_outbound_intents(p_channel text, p_limit integer default 50)
returns setof public.outbound_intents
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query select * from public.outbound_intents
  where channel = p_channel
    and requires_professional_review = false
    and (
      delivery_state in ('policy_allowed', 'queued', 'failed_transient')
      or (delivery_state = 'sending' and send_lease_expires_at < now())
    )
  order by created_at asc
  limit p_limit;
end;
$$;

comment on function public.list_claimable_outbound_intents is 'Descoberta pro sender worker (passo 6B) — mesmo critério de elegibilidade de claim_outbound_intent_for_send (nunca lista o que essa function não aceitaria reclamar), só que sem reclamar de fato. Nesta rodada: nunca lista requires_professional_review=true (achado real, ver comentário da coluna).';

-- claim_outbound_intent_for_send (0051) — mesma assinatura, create or
-- replace basta. A mesma trava é revalidada aqui na escrita real
-- (defesa em profundidade, nunca confia só na listagem acima pra
-- fechar o caminho — mesmo padrão já usado no resto deste bloco).
create or replace function public.claim_outbound_intent_for_send(p_outbound_intent_id uuid, p_worker_id text, p_lease_seconds integer default 60)
returns table (granted boolean, send_attempt_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempt_id uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_attempt_id := gen_random_uuid();

  update public.outbound_intents
  set delivery_state = 'sending', send_attempt_id = v_attempt_id,
      send_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      queued_at = coalesce(queued_at, now()), updated_at = now()
  where id = p_outbound_intent_id
    and requires_professional_review = false
    and (
      delivery_state in ('policy_allowed', 'queued', 'failed_transient')
      or (delivery_state = 'sending' and send_lease_expires_at < now())
    );

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  return query select true, v_attempt_id;
end;
$$;

comment on function public.claim_outbound_intent_for_send is 'Nunca reclama sent_unknown/sent_confirmed/failed_permanent/cancelled — só policy_allowed/queued/failed_transient (retry legítimo) ou sending com lease vencido (worker travado/crashado). Dois workers nunca vencem a mesma claim (mesmo padrão de approval_resolution_claims). Nesta rodada: nunca reclama requires_professional_review=true, mesma trava de list_claimable_outbound_intents revalidada aqui (defesa em profundidade).';

grant execute on function public.claim_outbound_intent_for_send to service_role;
