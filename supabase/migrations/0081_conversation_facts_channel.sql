-- Bookings unificado (correção 15/09/2026, achado da fundadora) —
-- get_conversation_operational_facts (0060) precisa expor `channel`
-- pra lista de Bookings conseguir mostrar a origem (WhatsApp, Link de
-- booking...) de um booking que já tem conversa vinculada, sem
-- reimplementar ownership: `channel` já é uma coluna comum de
-- conversations, já protegida pela mesma policy "select own" (0039)
-- que todo o resto desta function herda. Nenhuma tabela nova, nenhuma
-- mudança de escrita, nenhuma alteração de RLS — só mais uma coluna no
-- mesmo SELECT read-only já existente.
--
-- Postgres não permite `create or replace function` mudar o formato
-- de retorno de uma `returns table`, então precisa dropar antes.

drop function if exists public.get_conversation_operational_facts(uuid);

create function public.get_conversation_operational_facts(p_conversation_id uuid default null)
returns table (
  conversation_id uuid,
  conversation_type text,
  status text,
  mandate text,
  channel text,
  last_activity_at timestamptz,
  related_booking_id uuid,
  related_opportunity_id uuid,
  external_participant_id uuid,
  last_message_id uuid,
  last_message_author_type text,
  last_message_direction text,
  last_message_created_at timestamptz,
  has_pending_runtime_reply boolean,
  pending_runtime_reply_since timestamptz,
  last_outbound_intent_delivery_state text,
  last_outbound_intent_updated_at timestamptz
)
language sql
stable
as $$
  select
    c.id as conversation_id,
    c.conversation_type,
    c.status,
    c.mandate,
    c.channel,
    c.last_activity_at,
    c.related_booking_id,
    c.related_opportunity_id,
    c.external_participant_id,
    lm.id as last_message_id,
    lm.author_type as last_message_author_type,
    lm.direction as last_message_direction,
    lm.created_at as last_message_created_at,
    coalesce(pr.found, false) as has_pending_runtime_reply,
    pr.created_at as pending_runtime_reply_since,
    oi.delivery_state as last_outbound_intent_delivery_state,
    oi.updated_at as last_outbound_intent_updated_at
  from public.conversations c
  left join lateral (
    select cm.id, cm.author_type, cm.direction, cm.created_at
    from public.conversation_messages cm
    where cm.conversation_id = c.id
    order by cm.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select true as found, rpr.created_at
    from public.runtime_pending_replies rpr
    where rpr.conversation_id = c.id and rpr.status = 'pending'
    order by rpr.created_at desc
    limit 1
  ) pr on true
  left join lateral (
    select oi2.delivery_state, oi2.updated_at
    from public.outbound_intents oi2
    where oi2.conversation_id = c.id
    order by oi2.created_at desc
    limit 1
  ) oi on true
  where p_conversation_id is null or c.id = p_conversation_id;
$$;

comment on function public.get_conversation_operational_facts is 'Conversas Bloco 1 — fatos operacionais crus por conversa (última mensagem+autoria, pendência de retomada aberta, último outbound_intent+delivery_state, mandate/status/channel). SECURITY INVOKER (nunca definer): isolamento de tenant é 100% herdado das policies "select own" já testadas de conversations/conversation_messages/runtime_pending_replies/outbound_intents — esta function não reimplementa ownership, só agrega. Sem p_conversation_id, lista todas as conversas visíveis ao chamador sob RLS; com p_conversation_id de uma conversa que não é do chamador, retorna vazio (nunca erro) — mesmo comportamento de um SELECT direto negado por RLS. Nunca expõe conteúdo de outbound_intents, payload do Policy Gate, nem identidade do participante externo — só sinais operacionais. Estendida em 0081 com `channel`, pra Bookings unificado conseguir mostrar a origem do trabalho sem consulta extra.';

revoke all on function public.get_conversation_operational_facts from public;
grant execute on function public.get_conversation_operational_facts to authenticated;
revoke execute on function public.get_conversation_operational_facts from anon;
