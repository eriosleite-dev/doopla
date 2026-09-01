-- Doopla Intelligence Core v1 — Runtime, passo 6A+6B: fecha a state
-- machine de outbound_intents já desenhada na migration 0051 —
-- delivered_at/read_at já existiam como colunas, mas nenhuma RPC
-- escrevia neles (achado da auditoria do passo 6). Aditiva, pequena,
-- mesmo padrão de segurança (is_system_caller(), service_role só) já
-- usado em toda a família mark_outbound_intent_*.
--
-- Correlação por provider_message_id (o wamid), nunca por
-- outbound_intent_id/send_attempt_id — os webhooks assíncronos de
-- status da Meta chegam bem depois do envio, sem carregar nenhum dos
-- dois; o wamid é o único identificador estável que atravessa a
-- fronteira do provider de volta pra nós.

create function public.mark_outbound_intent_delivered(p_provider_message_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.outbound_intents
  set delivery_state = 'delivered', delivered_at = now(), updated_at = now()
  where provider_message_id = p_provider_message_id and delivery_state = 'sent_confirmed';

  return found;
end;
$$;

comment on function public.mark_outbound_intent_delivered is 'Webhook de status assíncrono (delivered) da Meta — só avança de sent_confirmed, nunca de sent_unknown/failed_*/read (nunca regride nem reclama estado que não fez esse envio). Reentrega do mesmo evento (Meta pode reenviar) é idempotente: found=false na segunda vez, sem erro.';

revoke all on function public.mark_outbound_intent_delivered from public;
grant execute on function public.mark_outbound_intent_delivered to service_role;
revoke execute on function public.mark_outbound_intent_delivered from anon, authenticated;

create function public.mark_outbound_intent_read(p_provider_message_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Aceita a partir de sent_confirmed OU delivered — a Meta não
  -- garante que o evento "delivered" sempre chega antes do "read"
  -- (rede/ordem de entrega do webhook), então nunca bloqueia "read"
  -- só porque "delivered" nunca chegou. Sempre progressão, nunca
  -- regride um estado mais avançado.
  update public.outbound_intents
  set delivery_state = 'read', read_at = now(), updated_at = now()
  where provider_message_id = p_provider_message_id and delivery_state in ('sent_confirmed', 'delivered');

  return found;
end;
$$;

comment on function public.mark_outbound_intent_read is 'Webhook de status assíncrono (read) da Meta — idempotente, mesma disciplina de mark_outbound_intent_delivered.';

revoke all on function public.mark_outbound_intent_read from public;
grant execute on function public.mark_outbound_intent_read to service_role;
revoke execute on function public.mark_outbound_intent_read from anon, authenticated;

-- Leitura pro sender (worker novo, passo 6B) — mesmo padrão de
-- list_due_runtime_pending_replies (migration 0054): nunca um select
-- direto na tabela mesmo com service_role, sempre uma RPC com
-- is_system_caller() explícito na fronteira (defesa em profundidade,
-- nunca depende só de qual client foi usado). Filtra por channel
-- porque o sender de um canal nunca deve tentar reclamar/enviar
-- outbound_intents de outro canal ainda sem adapter (ex.: email).
create function public.list_claimable_outbound_intents(p_channel text, p_limit integer default 50)
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
    and (
      delivery_state in ('policy_allowed', 'queued', 'failed_transient')
      or (delivery_state = 'sending' and send_lease_expires_at < now())
    )
  order by created_at asc
  limit p_limit;
end;
$$;

comment on function public.list_claimable_outbound_intents is 'Descoberta pro sender worker (passo 6B) — mesmo critério de elegibilidade de claim_outbound_intent_for_send (nunca lista o que essa function não aceitaria reclamar), só que sem reclamar de fato — o claim atômico continua sendo a única escrita real, essa function é só leitura pra decidir em quais tentar.';

revoke all on function public.list_claimable_outbound_intents from public;
grant execute on function public.list_claimable_outbound_intents to service_role;
revoke execute on function public.list_claimable_outbound_intents from anon, authenticated;
