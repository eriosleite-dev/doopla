-- Doopla Intelligence OS v1 — Professional Product UI, Foundation.
--
-- Read model canônico dos FATOS compartilhados da futura Home
-- (Web + App). Motivo de existir: Web e Mobile hoje calculam "o que
-- mostrar na Home" com queries ad hoc próprias, cada lado montando o
-- próprio recorte — nenhum dos dois é errado individualmente, mas
-- nada garante que os dois concordem sobre o mesmo fato à medida que
-- o produto evolui. Esta function é a ÚNICA fonte pros fatos
-- objetivamente contáveis daqui pra frente — nunca copy, nunca
-- decisão visual, nunca uma métrica inventada porque apareceu num
-- protótipo.
--
-- Escopo deliberadamente estreito: só fatos que já são
-- deterministicamente contáveis a partir de dado existente. NÃO
-- inclui a lista completa de "Precisa de você" (getAttentionItems,
-- src/app/dashboard/data.ts) — aquela função cruza representation_requests/
-- opportunities/invites com regras de produto bem mais amplas que
-- contar linhas, e reimplementá-la aqui seria arriscar divergência
-- silenciosa da lógica já validada, não eliminá-la. Registrado como
-- gap explícito, não resolvido silenciosamente (ver PROGRESS.md).
--
-- SECURITY INVOKER (nunca definer): mesmo padrão de
-- get_conversation_operational_facts (0060) — cada tabela referenciada
-- aqui dentro já tem sua própria RLS "select own" testada
-- (bookings, subscriptions, referrals, professional_whatsapp_identities,
-- conversations/runtime_pending_replies/outbound_intents); esta
-- function não reimplementa ownership, só agrega. Sem parâmetro:
-- sempre os fatos do PRÓPRIO chamador (auth.uid()), nunca de outro
-- profissional — não existe caso de uso pra ler a Home de outra
-- pessoa.
--
-- Escopo = profissional (artista), como em todo o resto do produto —
-- represented_professional_id/artist_profile_id são sempre o
-- profissional que a Doopla representa, nunca o booker. Um booker
-- chamando isto vê zeros nos campos de booking/conversa (nenhuma
-- linha bate artist_profile_id=auth.uid()), nunca um erro — mesmo
-- comportamento silencioso-e-honesto de RLS negada em outros lugares.
create function public.get_professional_home_facts()
returns table (
  professional_id uuid,
  full_name text,
  account_created_at timestamptz,

  whatsapp_identity_status text,
  whatsapp_verified_number text,

  bookings_awaiting_response_count integer,
  bookings_confirmed_count integer,
  bookings_completed_count integer,

  next_booking_id uuid,
  next_booking_event_date date,
  next_booking_other_party_name text,

  -- Mesmo critério EXATO de 'needs_you' em
  -- src/lib/conversations/state.ts (deriveConversationState) e
  -- mobile/src/lib/conversation-state.ts — pendência de retomada
  -- aberta OU último outbound_intent em policy_allowed. Mudar o
  -- critério lá sem mudar aqui (ou vice-versa) quebra "mesmo fato,
  -- mesma definição" — comentário cruzado de propósito nos 3 lugares.
  conversations_needing_you_count integer,

  referral_total_count integer,
  referral_qualified_count integer,

  subscription_role text,
  subscription_status text,
  -- artist_plan quando role='artista' (escopo desta function),
  -- sempre null pra qualquer outro role.
  subscription_plan text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    auth.uid() as professional_id,
    p.full_name,
    p.created_at as account_created_at,

    wi.status as whatsapp_identity_status,
    wi.verified_number as whatsapp_verified_number,

    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status = 'proposta_enviada'
        and b.proposed_by <> 'artista'
    )::integer as bookings_awaiting_response_count,
    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status in ('aceita', 'aguardando_pagamento')
    )::integer as bookings_confirmed_count,
    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status = 'concluida'
    )::integer as bookings_completed_count,

    nb.id as next_booking_id,
    nb.event_date as next_booking_event_date,
    nb_other.full_name as next_booking_other_party_name,

    (
      select count(*) from public.conversations c
      where c.represented_professional_id = auth.uid()
        and c.status = 'open'
        and (
          exists (
            select 1 from public.runtime_pending_replies rpr
            where rpr.conversation_id = c.id and rpr.status = 'pending'
          )
          or coalesce((
            select oi.delivery_state from public.outbound_intents oi
            where oi.conversation_id = c.id
            order by oi.created_at desc
            limit 1
          ), '') = 'policy_allowed'
        )
    )::integer as conversations_needing_you_count,

    (
      select count(*) from public.referrals r
      where r.referrer_profile_id = auth.uid()
    )::integer as referral_total_count,
    (
      select count(*) from public.referrals r
      where r.referrer_profile_id = auth.uid() and r.status = 'qualificada'
    )::integer as referral_qualified_count,

    s.role::text as subscription_role,
    s.status::text as subscription_status,
    case when s.role = 'artista' then s.artist_plan::text else null end as subscription_plan
  from public.profiles p
  left join public.professional_whatsapp_identities wi on wi.professional_id = p.id
  left join public.subscriptions s on s.profile_id = p.id
  left join lateral (
    select b.id, b.event_date, b.booker_profile_id
    from public.bookings b
    where b.artist_profile_id = auth.uid()
      and b.status in ('aceita', 'aguardando_pagamento')
      and b.event_date is not null
      and b.event_date >= current_date
    order by b.event_date asc
    limit 1
  ) nb on true
  left join public.profiles nb_other on nb_other.id = nb.booker_profile_id
  where p.id = auth.uid();
$$;

comment on function public.get_professional_home_facts is 'Professional Product UI Foundation — read model canônico dos fatos objetivamente contáveis da Home (Web+App), SECURITY INVOKER sobre RLS já testada de cada tabela. Nunca inclui a lista completa de "Precisa de você" (getAttentionItems permanece lógica de app por enquanto, gap registrado). conversations_needing_you_count usa o MESMO critério de deriveConversationState() — mudar um sem o outro quebra paridade de fato Web/Mobile.';

revoke all on function public.get_professional_home_facts() from public;
grant execute on function public.get_professional_home_facts() to authenticated;
revoke execute on function public.get_professional_home_facts() from anon, service_role;
