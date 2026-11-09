-- Doopla — Direct Booking sem Booker (passo 2/2).
--
-- Fecha o gap auditado e aprovado pela fundadora: um cliente que chega
-- por /orcamento/[slug] (0023/0082) cria opportunity + conversation,
-- o Approval Engine (Bloco 5) já registra `accept_or_decline_work`
-- quando o profissional aceita o trabalho na conversa — mas hoje NADA
-- transforma esse aceite em um Booking de verdade. `booker_profile_id
-- NOT NULL` (0003) é o bloqueio estrutural. Nenhum Booker fake é
-- criado — Booking direto nasce com booker_profile_id = null.
--
-- Decisões de produto já aprovadas (não revisitadas aqui):
--   1. Sem botão manual "Confirmar fechamento" — a única fonte de
--      verdade é a decisão real do profissional já representada pelo
--      Approval Engine (accept_or_decline_work, correção semântica
--      16/09/2026: {accepted:boolean} explícito, nunca a mera
--      existência do registro).
--   2. Contrato padrão Doopla pra Direct Booking = PENDING, fora deste
--      bloco (tratado no código TS, não aqui).
--   6. Booking nunca nasce só porque conversation/opportunity existe,
--      preço foi discutido ou a Doopla mandou proposta — só do fato
--      canônico e inequívoco de accept_or_decline_work com
--      accepted=true.

-- ============================================================
-- 1. bookings.booker_profile_id vira nullable — única alteração
--    estrutural a uma tabela pré-existente além da unique index abaixo.
--    Bookings antigos (todos com booker) continuam 100% intactos —
--    NOT NULL só impedia a LINHA NOVA que este bloco passa a criar.
-- ============================================================
alter table public.bookings
  alter column booker_profile_id drop not null;

comment on column public.bookings.booker_profile_id is 'Nullable desde 16/09/2026 (Direct Booking) — null significa booking sem Booker/agenciamento, criado direto a partir de um aceite do profissional (ver convert_opportunity_to_booking). Todo booking pré-existente continua com Booker.';

-- ============================================================
-- 2. Unique index parcial — uma opportunity nunca pode virar mais de
--    um Booking. Parcial (where not null) porque bookings antigos, sem
--    conversão nenhuma, têm originated_from_opportunity_id = null e
--    não podem colidir entre si.
-- ============================================================
create unique index bookings_originated_from_opportunity_unique_idx
  on public.bookings (originated_from_opportunity_id)
  where originated_from_opportunity_id is not null;

-- ============================================================
-- 3. convert_opportunity_to_booking — função canônica única de
--    conversão. SECURITY DEFINER (bypassa RLS legitimamente, mesmo
--    padrão de _create_conversation_core/0082), mas SÓ chamável por
--    service_role (Runtime) — nem o próprio profissional autenticado
--    pode chamar diretamente (não existe caminho de UI pra isso, por
--    decisão de produto: item 1 acima). Fail-closed em 2 camadas:
--    GRANT (só service_role) + checagem interna de is_system_caller()
--    (defesa em profundidade, nunca confia só no GRANT).
-- ============================================================
create function public.convert_opportunity_to_booking(p_opportunity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.opportunities;
  v_existing_booking_id uuid;
  v_new_booking_id uuid;
  v_accepted_value jsonb;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Serializa concorrência por opportunity — duas chamadas simultâneas
  -- pra mesma oportunidade nunca criam 2 bookings (mesmo padrão de
  -- advisory lock já usado no ramo idempotente de create_conversation,
  -- 0039/0082).
  perform pg_advisory_xact_lock(hashtextextended(p_opportunity_id::text, 0));

  -- Idempotência: chamada repetida pra mesma opportunity sempre
  -- devolve o MESMO booking, nunca cria um segundo (garantido também
  -- fisicamente pelo unique index acima — este SELECT só evita o erro
  -- de constraint e devolve o id certo em vez de propagar exceção).
  select id into v_existing_booking_id
  from public.bookings
  where originated_from_opportunity_id = p_opportunity_id;

  if v_existing_booking_id is not null then
    return v_existing_booking_id;
  end if;

  select * into v_opportunity from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- STOP CONDITION física, nunca só de design: só a versão ATIVA (mais
  -- recente) de accept_or_decline_work, com accepted=true explícito,
  -- autoriza a criação. get_active_approvals já resolve
  -- commercial_root_id = a própria opportunity (nenhum booking existe
  -- ainda nesta chamada). subject_key='primary' — categoria singular,
  -- nunca multi-instância (ver SUBJECT_KEY_TAXONOMY, value-schemas.ts).
  -- Um registro legado {} (pré correção semântica 16/09/2026) nunca
  -- passa aqui: approved_value->>'accepted' seria null, distinto de
  -- 'true' em texto — fail-closed estrutural, sem regra escrita à mão.
  select ar.approved_value into v_accepted_value
  from public.get_active_approvals(v_opportunity.artist_profile_id, null, p_opportunity_id) ar
  where ar.decision_category = 'accept_or_decline_work'
    and ar.subject_key = 'primary';

  if v_accepted_value is null or (v_accepted_value ->> 'accepted') is distinct from 'true' then
    raise exception 'no_canonical_acceptance' using errcode = 'P0001';
  end if;

  -- Copia só condições comerciais REAIS já disponíveis na opportunity —
  -- nunca inventa valor/data/cliente/disponibilidade/condições. Campos
  -- sem default explícito aqui (payment_mode, requires_invoice,
  -- cancellation_policy_version, dispute_status) usam o DEFAULT já
  -- existente da tabela (0024/0035) — mesmo valor neutro que todo
  -- booking novo recebe, nunca um valor especial pra Direct Booking.
  insert into public.bookings (
    artist_profile_id, booker_profile_id, status, proposed_by,
    commission_percent, cache_amount_cents, description, event_date,
    client_name, event_location, originated_from_opportunity_id
  ) values (
    v_opportunity.artist_profile_id, null, 'aceita', 'artista',
    -- 0, não null: representa exatamente a realidade (nenhum Booker
    -- pra receber comissão), nunca um valor inventado. commission_percent
    -- continua NOT NULL — 0 é o único valor honesto aqui.
    0, v_opportunity.cache_amount_cents, v_opportunity.description, v_opportunity.event_date,
    v_opportunity.client_name, v_opportunity.location, p_opportunity_id
  )
  returning id into v_new_booking_id;

  update public.opportunities
  set status = 'convertida'
  where id = p_opportunity_id;

  -- Preserva related_opportunity_id (rastreabilidade histórica
  -- pedido→opportunity→conversation→decisão→booking) — nunca zerado.
  -- related_booking_id passa a apontar pro booking novo. Todas as
  -- conversations da opportunity (normalmente 1, criada atomicamente
  -- por submit_orcamento_request) recebem o vínculo.
  update public.conversations
  set related_booking_id = v_new_booking_id
  where related_opportunity_id = p_opportunity_id
    and represented_professional_id = v_opportunity.artist_profile_id;

  return v_new_booking_id;
end;
$$;

comment on function public.convert_opportunity_to_booking is 'Direct Booking (16/09/2026) — único caminho de conversão opportunity→booking sem Booker. Só service_role (Runtime) pode chamar — GRANT restrito + is_system_caller() interno, defesa em profundidade. Idempotente (unique index + advisory lock). STOP CONDITION física: só cria Booking com accept_or_decline_work ativo e accepted=true explícito (correção semântica 16/09/2026) — nunca pela mera existência de uma conversation/opportunity/preço discutido.';

revoke all on function public.convert_opportunity_to_booking from public;
grant execute on function public.convert_opportunity_to_booking to service_role;
revoke execute on function public.convert_opportunity_to_booking from anon, authenticated;

-- ============================================================
-- 4. create_pending_reviews (0017) — guarda contra Direct Booking.
--    Achado real da auditoria de UI (16/09/2026): reviews.reviewer_profile_id/
--    reviewee_profile_id são NOT NULL. Sem esta guarda, um Direct
--    Booking (booker_profile_id null) que chegasse a status='concluida'
--    faria este trigger tentar inserir uma linha com
--    reviewer_profile_id ou reviewee_profile_id null, violando a
--    constraint e abortando a transação que fecha o booking — um crash
--    real, não só um label errado. A avaliação artista→booker/
--    booker→artista simplesmente não existe quando não há Booker;
--    nenhuma avaliação "fantasma" é criada no lugar.
-- ============================================================
create or replace function public.create_pending_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' and new.booker_profile_id is not null then
    insert into public.reviews (booking_id, reviewer_profile_id, reviewee_profile_id)
    values
      (new.id, new.artist_profile_id, new.booker_profile_id),
      (new.id, new.booker_profile_id, new.artist_profile_id)
    on conflict (booking_id, reviewer_profile_id) do nothing;
  end if;
  return new;
end;
$$;

comment on function public.create_pending_reviews is '0017, estendida (16/09/2026, Direct Booking): só cria os 2 slots de avaliação quando o booking tem Booker de verdade (booker_profile_id not null) — um Direct Booking concluído nunca gera slot de avaliação com participante null (violaria NOT NULL e abortaria a transação). Mesmo trigger/condição de conclusão de sempre, só a guarda nova.';
