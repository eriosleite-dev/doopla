-- Doopla Intelligence OS v1 — Conversas, Bloco 1 (revisado).
--
-- Boundary read-only ÚNICO: expõe FATOS operacionais crus de
-- conversations, nunca um estado de UX derivado/imposto. Decisão do
-- usuário (rodada de auditoria + correção 2): "o primeiro boundary
-- read-only deve expor os fatos operacionais confiáveis... não quero
-- persistir estado redundante". Nenhuma tabela nova, nenhuma escrita,
-- nenhuma mudança no Runtime — só uma function SQL de leitura que
-- agrega, por conversa, o que já existe em 4 tabelas.
--
-- Decisão de segurança central desta migration: LANGUAGE SQL sem
-- SECURITY DEFINER (= SECURITY INVOKER, o default do Postgres) — nunca
-- security definer aqui. As 4 tabelas envolvidas já têm policy própria
-- de "select own" pro role authenticated, cada uma já testada
-- adversarialmente na sua própria migration:
--   conversations                 -> "conversations: select own" (0039)
--   conversation_messages         -> "conversation_messages: select via conversation" (0039)
--   runtime_pending_replies       -> "runtime_pending_replies: select own" (0056)
--   outbound_intents              -> "outbound_intents: select own" (0051)
-- Rodando como INVOKER, cada referência a essas tabelas dentro da
-- function fica sujeita à MESMA RLS que já protege o cliente direto —
-- isolamento de tenant nunca duplicado/reimplementado aqui, só
-- reaproveitado. Nenhuma lógica de ownership nova pra auditar.
--
-- Deliberadamente NUNCA expõe: conteúdo de outbound_intents.content
-- (rascunho ainda não entregue), policy_gate_decision_id/checks
-- (payload interno do Gate), run_id/orchestrator internals, nome do
-- participante externo (fica pra external_participants, já com sua
-- própria RLS, lido à parte por quem precisar) — só os sinais mínimos
-- pra permitir DERIVAR estado na camada de apresentação, nunca dados
-- confidenciais ou de auditoria interna.
create function public.get_conversation_operational_facts(p_conversation_id uuid default null)
returns table (
  conversation_id uuid,
  conversation_type text,
  status text,
  mandate text,
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

comment on function public.get_conversation_operational_facts is 'Conversas Bloco 1 — fatos operacionais crus por conversa (última mensagem+autoria, pendência de retomada aberta, último outbound_intent+delivery_state, mandate/status). SECURITY INVOKER (nunca definer): isolamento de tenant é 100% herdado das policies "select own" já testadas de conversations/conversation_messages/runtime_pending_replies/outbound_intents — esta function não reimplementa ownership, só agrega. Sem p_conversation_id, lista todas as conversas visíveis ao chamador sob RLS; com p_conversation_id de uma conversa que não é do chamador, retorna vazio (nunca erro) — mesmo comportamento de um SELECT direto negado por RLS. Nunca expõe conteúdo de outbound_intents, payload do Policy Gate, nem identidade do participante externo — só sinais operacionais.';

-- pg_default_acl deste projeto auto-concede EXECUTE a anon em toda
-- function nova (achado real, migrations 0051+) — revoke de public
-- sozinho não bloqueia anon, precisa ser explícito. Mesmo assim, uma
-- chamada de anon aqui sempre retornaria vazio (auth.uid() é null,
-- "conversations: select own" nunca casa) — a revoke de EXECUTE é
-- defesa em profundidade, não a única barreira.
revoke all on function public.get_conversation_operational_facts from public;
grant execute on function public.get_conversation_operational_facts to authenticated;
revoke execute on function public.get_conversation_operational_facts from anon;
