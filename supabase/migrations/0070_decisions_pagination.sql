-- Doopla — Decisões: paginação real server-side (20 + Carregar mais) e
-- ordem default corrigida pra Recentes.
--
-- Antes: listActionableDecisions/listResolvedDecisions buscavam TUDO
-- (sem limit/cursor pra pending; limit=50 fixo sem offset pra
-- resolved) e o agrupamento por conversa + ordenação por prioridade
-- rodavam inteiramente no client depois de já ter carregado tudo do
-- servidor — exatamente o anti-padrão "carregar tudo e só esconder no
-- front" que não queríamos. Estas duas funções fazem o agrupamento
-- (só pending — resolvidas nunca agrupam, cada linha é um evento de
-- resolução distinto, uma conversa pode ter mais de um ao longo do
-- tempo), a ordenação e o LIMIT/OFFSET inteiramente em SQL, com o
-- total real (pós-agrupamento, pré-corte) via count(*) over().
--
-- security invoker (padrão, não security definer de propósito) — RLS
-- de runtime_pending_replies/outbound_intents/policy_gate_decisions/
-- conversations/conversation_messages já protege cada leitura,
-- exatamente a mesma filosofia documentada em decisions/data.ts: nunca
-- um filtro de posse duplicado aqui.

create function public.list_actionable_decisions_page(
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
    where o.delivery_state = 'policy_allowed'
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
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

comment on function public.list_actionable_decisions_page(text, integer, integer) is 'Página de "Precisa de você": agrupada por conversa (prepared_draft vence pending_reply), ordenada por p_sort (recentes default/antigas/prioridade), total_count é o total real pós-agrupamento pré-LIMIT. Web e App chamam a mesma função.';

grant execute on function public.list_actionable_decisions_page(text, integer, integer) to authenticated;

create function public.list_resolved_decisions_page(
  p_sort text default 'recentes',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  conversation_id uuid,
  related_booking_id uuid,
  resolved_at timestamptz,
  status text,
  superseded_by_id uuid,
  prepared_response_outcome text,
  source text,
  total_count bigint
)
language sql
stable
as $$
  with raw as (
    select
      r.id, r.conversation_id, c.related_booking_id,
      r.resolved_at, r.status, r.superseded_by_id,
      null::text as prepared_response_outcome,
      'pending_reply'::text as source
    from public.runtime_pending_replies r
    left join public.conversations c on c.id = r.conversation_id
    where r.status in ('completed', 'superseded') and r.resolved_at is not null
    union all
    select
      m.id, m.conversation_id, c.related_booking_id,
      m.created_at as resolved_at, null::text as status, null::uuid as superseded_by_id,
      m.prepared_response_outcome,
      'prepared_draft'::text as source
    from public.conversation_messages m
    left join public.conversations c on c.id = m.conversation_id
    where m.replied_to_outbound_intent_id is not null
  )
  select
    raw.*,
    count(*) over() as total_count
  from raw
  order by
    case when p_sort = 'antigas' then raw.resolved_at end asc,
    case when p_sort <> 'antigas' then raw.resolved_at end desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

comment on function public.list_resolved_decisions_page(text, integer, integer) is 'Página de "Resolvidas": nunca agrupa (cada linha é um evento de resolução distinto — a mesma conversa pode resolver mais de uma vez ao longo do tempo). Mesmo padrão de total_count/p_sort de list_actionable_decisions_page.';

grant execute on function public.list_resolved_decisions_page(text, integer, integer) to authenticated;
