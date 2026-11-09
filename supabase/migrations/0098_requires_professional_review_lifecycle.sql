-- requires_professional_review — ciclo de vida completo (auditoria
-- conjunta aprovada pela fundadora, 01/10/2026). Dois achados reais da
-- auditoria, corrigidos aqui:
--
-- 1) "policy_allowed sozinho não significa Precisa de você" — a
--    condição correta sempre foi delivery_state='policy_allowed' AND
--    requires_professional_review=true (migration 0083 já criava essa
--    distinção pro ENVIO automático, mas ela nunca chegou até a leitura
--    de estado/decisões). Sem isso, qualquer draft comum — inclusive um
--    que o cron ia mandar sozinho em segundos — disparava "Precisa de
--    você" e aparecia como prepared_draft, igual a um retido de
--    verdade. 4 lugares tinham essa mesma lacuna; corrigidos nesta
--    migration (SQL) + no mesmo commit (TS): get_conversation_
--    operational_facts (agora expõe o sinal que faltava),
--    list_actionable_decisions_page (aqui dentro), e
--    deriveConversationState()/listActionableDecisions()/
--    getPendingDraftForConversation() (TS, mesmo commit).
--
-- 2) Nenhum mecanismo fechava o draft original depois do profissional
--    responder — cancel_outbound_intent() (0051) existe mas nunca é
--    chamada em lugar nenhum do código. persist_inbound_message (0066)
--    grava proveniência (replied_to_outbound_intent_id,
--    prepared_response_outcome) mas nunca muda o delivery_state da
--    linha original, que continuava 'policy_allowed' pra sempre —
--    reaparecendo como pendência mesmo já respondida.
--
-- Decisão de segurança (pedido explícito da fundadora): NÃO reutilizar
-- cancel_outbound_intent() pra fechar o draft original — ela só checa
-- is_system_caller(), nunca valida que o outbound_intent pertence à
-- MESMA conversation/professional de quem está chamando. Expor isso ao
-- frontend (ou chamar com um id vindo do client sem revalidar) deixaria
-- um outboundIntentId arbitrário encerrar a intenção de outra
-- conversa/profissional. Em vez disso, o fechamento vira parte do
-- corpo de persist_inbound_message — que JÁ carrega v_outbound validado
-- (existe, pertence à mesma conversation) desde a 0066 — com 2
-- validações novas (pertence ao mesmo professional; é
-- requires_professional_review=true E está num estado cancelável) e
-- roda na MESMA transação do INSERT da mensagem (atomicidade por
-- construção: uma function plpgsql é uma transação só, nunca precisa
-- de um segundo round-trip). Todas as condições viram WHERE de um
-- UPDATE condicional — nunca um IF/RAISE: se qualquer condição não
-- bater (draft de outra conversa, não é retido, já não está mais
-- cancelável), a atualização simplesmente não encontra linha e não faz
-- nada — o envio da mensagem em si NUNCA é bloqueado por isso. Regra 4
-- da fundadora ("nunca cancelar um outbound_intent automático só por
-- estar policy_allowed") sai garantida pela própria condição
-- requires_professional_review=true no WHERE.

-- =====================================================================
-- 1. get_conversation_operational_facts — expõe requires_professional_
-- review do outbound_intent mais recente. Mesmo padrão de extensão já
-- usado em 0081 (channel): drop + create, porque RETURNS TABLE mudou
-- de formato (create or replace não permite isso).
-- =====================================================================

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
  last_outbound_intent_requires_review boolean,
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
    oi.requires_professional_review as last_outbound_intent_requires_review,
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
    select oi2.delivery_state, oi2.requires_professional_review, oi2.updated_at
    from public.outbound_intents oi2
    where oi2.conversation_id = c.id
    order by oi2.created_at desc
    limit 1
  ) oi on true
  where p_conversation_id is null or c.id = p_conversation_id;
$$;

comment on function public.get_conversation_operational_facts is 'Conversas Bloco 1 — fatos operacionais crus por conversa (última mensagem+autoria, pendência de retomada aberta, último outbound_intent+delivery_state+requires_professional_review, mandate/status/channel). SECURITY INVOKER (nunca definer): isolamento de tenant é 100% herdado das policies "select own" já testadas de conversations/conversation_messages/runtime_pending_replies/outbound_intents — esta function não reimplementa ownership, só agrega. Sem p_conversation_id, lista todas as conversas visíveis ao chamador sob RLS; com p_conversation_id de uma conversa que não é do chamador, retorna vazio (nunca erro). Nunca expõe conteúdo de outbound_intents, payload do Policy Gate, nem identidade do participante externo — só sinais operacionais. Estendida em 0098 com last_outbound_intent_requires_review — sem isso, deriveConversationState() não conseguia distinguir um draft genuinamente retido (requires_professional_review=true) de um comum que o cron ia mandar sozinho em segundos (os dois ficam em delivery_state=policy_allowed).';

revoke all on function public.get_conversation_operational_facts from public;
grant execute on function public.get_conversation_operational_facts to authenticated;
revoke execute on function public.get_conversation_operational_facts from anon;

-- =====================================================================
-- 2. outbound_intent_needs_professional_review — predicado único do
-- lado SQL, mesma regra exata do lado TS
-- (isOutboundDraftAwaitingProfessionalReview, src/lib/conversations/
-- state.ts) — nenhuma query SQL deveria reescrever esta condição
-- inline de novo, sempre chamar esta function. Reduz o drift que já
-- aconteceu uma vez (4 lugares com a mesma condição incompleta).
-- =====================================================================

create function public.outbound_intent_needs_professional_review(p_delivery_state text, p_requires_review boolean)
returns boolean
language sql
immutable
as $$
  select p_delivery_state = 'policy_allowed' and p_requires_review is true;
$$;

comment on function public.outbound_intent_needs_professional_review is 'Predicado canônico único (SQL) de "este outbound_intent exige ação do profissional" — policy_allowed sozinho NUNCA basta, precisa também de requires_professional_review=true (migration 0083). Equivalente exato de isOutboundDraftAwaitingProfessionalReview em src/lib/conversations/state.ts (TS não pode chamar SQL nem vice-versa — mantidos sincronizados por comentário cruzado, não por import). Usada por list_actionable_decisions_page; qualquer SQL futuro que precise da mesma pergunta (ex.: uma fonte de Notificações) deve chamar esta function, nunca reescrever a condição inline.';

revoke all on function public.outbound_intent_needs_professional_review from public;
grant execute on function public.outbound_intent_needs_professional_review to authenticated, service_role;
revoke execute on function public.outbound_intent_needs_professional_review from anon;

-- =====================================================================
-- 3. list_actionable_decisions_page — mesma correção, via o predicado
-- acima. Órfã desde 15/09/2026 (/dashboard/decisoes virou redirect,
-- decisão canônica da fundadora — ver decisoes/page.tsx), mas corrigida
-- mesmo assim: decisão explícita de não deixar uma definição ERRADA
-- esperando ser revivida por engano no futuro. create or replace basta
-- (retorno inalterado, só o WHERE de um dos dois ramos do UNION ALL).
-- =====================================================================

create or replace function public.list_actionable_decisions_page(
  p_sort text default 'recentes',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind text,
  conversation_id uuid,
  related_booking_id uuid,
  related_opportunity_id uuid,
  commercial_root_id uuid,
  created_at timestamptz,
  block_reason text,
  prepared_content text,
  total_count bigint
)
language sql
stable
as $$
  with raw as (
    select
      r.id, 'pending_reply'::text as kind, r.conversation_id,
      r.commercial_root_id, r.created_at,
      g.primary_block_reason as block_reason,
      null::text as prepared_content
    from public.runtime_pending_replies r
    left join public.policy_gate_decisions g on g.id = r.policy_gate_decision_id
    where r.status = 'pending'
    union all
    select
      o.id, 'prepared_draft'::text as kind, o.conversation_id,
      null::uuid as commercial_root_id, o.created_at,
      null::text as block_reason,
      o.content as prepared_content
    from public.outbound_intents o
    where public.outbound_intent_needs_professional_review(o.delivery_state, o.requires_professional_review)
  ),
  -- Uma conversa pode ter as duas linhas (pending_reply E prepared_draft)
  -- ao mesmo tempo — prepared_draft vence (mais acionável, já tem
  -- resposta pronta), mesma regra de groupDecisionsByConversation (TS).
  grouped as (
    select distinct on (raw.conversation_id) raw.*
    from raw
    order by raw.conversation_id, (raw.kind = 'prepared_draft') desc, raw.created_at asc
  ),
  ranked as (
    select
      grouped.*,
      c.related_booking_id,
      c.related_opportunity_id,
      case
        when grouped.kind = 'prepared_draft' then 0
        when grouped.block_reason = 'professional_not_operationally_ready' then 2
        else 1
      end as priority_rank
    from grouped
    left join public.conversations c on c.id = grouped.conversation_id
  )
  select
    ranked.id, ranked.kind, ranked.conversation_id,
    ranked.related_booking_id, ranked.related_opportunity_id,
    ranked.commercial_root_id, ranked.created_at, ranked.block_reason,
    ranked.prepared_content,
    count(*) over() as total_count
  from ranked
  order by
    case when p_sort = 'prioridade' then ranked.priority_rank end asc nulls last,
    case when p_sort = 'prioridade' then ranked.created_at end asc,
    case when p_sort = 'antigas' then ranked.created_at end asc,
    case when p_sort not in ('prioridade', 'antigas') then ranked.created_at end desc
  limit p_limit offset p_offset;
$$;

comment on function public.list_actionable_decisions_page is 'Órfã desde 15/09/2026 (/dashboard/decisoes virou redirect — nunca reviver a página por causa desta correção, decisão da fundadora). Corrigida em 0098 pra nunca carregar uma definição desatualizada: usa outbound_intent_needs_professional_review em vez de checar só delivery_state=policy_allowed.';

-- =====================================================================
-- 4. persist_inbound_message — fecha o draft original quando a
-- resposta do profissional responde a ele. Assinatura inalterada
-- (create or replace basta). Validações novas, todas dentro do WHERE
-- do UPDATE condicional (nunca um IF/RAISE — uma condição que não bate
-- só significa "nada a fechar", nunca bloqueia o envio da mensagem
-- em si):
--   - mesma conversation (v_outbound já validado acima, reforçado aqui);
--   - mesmo professional (redundante por construção — outbound_intents.
--     professional_id é sempre o represented_professional_id da MESMA
--     conversation, e author_mismatch já garante isso acima — mantido
--     mesmo assim, defesa em profundidade, nunca uma camada só);
--   - requires_professional_review=true (nunca fecha um draft comum só
--     por estar policy_allowed — regra 4 da fundadora);
--   - delivery_state ainda cancelável (policy_allowed/queued).
-- =====================================================================

create or replace function public.persist_inbound_message(
  p_conversation_id uuid,
  p_author_type text,
  p_author_profile_id uuid,
  p_author_external_participant_id uuid,
  p_channel text,
  p_content_type text,
  p_body text,
  p_origin_intake_id uuid default null,
  p_replied_to_outbound_intent_id uuid default null
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

  insert into public.conversation_messages (
    conversation_id, direction, author_type, author_profile_id, author_external_participant_id,
    channel, content_type, body, generated_by, origin_intake_id,
    replied_to_outbound_intent_id, prepared_response_outcome
  ) values (
    p_conversation_id, 'inbound', p_author_type,
    case when p_author_type = 'professional' then p_author_profile_id else null end,
    case when p_author_type = 'external_participant' then p_author_external_participant_id else null end,
    p_channel, p_content_type, p_body, 'human', p_origin_intake_id,
    p_replied_to_outbound_intent_id, v_prepared_response_outcome
  )
  returning * into v_message;

  update public.conversations set last_activity_at = now() where id = p_conversation_id;

  return v_message;
end;
$$;

comment on function public.persist_inbound_message is 'Orchestrator/Runtime — único caminho de escrita de mensagem inbound de EXTERNAL_PARTICIPANT (a RLS de conversation_messages só permite insert direto de mensagem própria do profissional, de propósito, e mesmo essa policy foi fechada em 0061). Estendida (0062) com p_origin_intake_id opcional. Estendida (Conversas Bloco 2, 0066) com p_replied_to_outbound_intent_id opcional: grava replied_to_outbound_intent_id + prepared_response_outcome (fato observado sent/edited) no mesmo INSERT. Estendida de novo (0098, ciclo de requires_professional_review): quando a resposta responde a um draft genuinamente retido (requires_professional_review=true) ainda cancelável, fecha esse outbound_intent original (delivery_state=cancelled, failure_reason=superseded_by_professional_reply) na MESMA transação — nunca deixa um draft já respondido reaparecer como pendência. Validação de posse (mesma conversation + mesmo professional) feita aqui dentro, nunca delegada ao frontend: um outboundIntentId arbitrário de outra conversa/profissional nunca fecha nada (o UPDATE condicional simplesmente não encontra linha). Retry (dedupe por claim_inbound_event, migration 0051) nunca chama esta function duas vezes pro mesmo evento.';

revoke all on function public.persist_inbound_message from public;
grant execute on function public.persist_inbound_message to service_role;
revoke execute on function public.persist_inbound_message from anon, authenticated;
