-- Doopla — Direct Booking sem Booker: correção real encontrada em E2E
-- (Sessão Central, 21/09/2026).
--
-- convert_opportunity_to_booking (0087) revalidava o aceite exigindo
-- `subject_key = 'primary'` — suposição herdada da convenção de
-- categorias singulares (SINGULAR_SUBJECT_KEY, decision-categories.ts).
-- Essa convenção NUNCA é validada/corrigida em código: subject_key é
-- texto livre decidido pelo model (resolver.ts, schema `z.string()`),
-- só orientado por prompt a usar 'primary' — nunca garantido. Num
-- teste E2E real (cenário #1, dj/aniversário), a IA commitou
-- accept_or_decline_work com subject_key = o próprio opportunity_id,
-- não 'primary'. Resultado: a function nunca encontrava o registro e
-- sempre lançava no_canonical_acceptance, mesmo com um aceite
-- canônico real e válido já commitado.
--
-- Achado isolado a esta function — auditado antes de corrigir:
-- hasCanonicalWorkAcceptance (pipeline.ts, o gatilho TS que decide SE
-- chama esta RPC) já checa só decision_category + accepted===true,
-- sem exigir subject_key nenhum — está correto e é o padrão que esta
-- migration replica aqui. doopla-intervention.ts (label "precisa de
-- você") também não depende de subject_key. Nenhum outro consumidor
-- desta categoria foi encontrado assumindo 'primary'.
--
-- Correção: mesma regra do TS, sem subject_key exigido — existe pelo
-- menos um accept_or_decline_work ativo (get_active_approvals já
-- resolve "ativo" = última versão de cada chain (categoria,
-- subject_key)) com accepted=true explícito. Continua fail-closed:
-- um registro legado {} (accepted null) ou accepted=false nunca passa
-- aqui, exatamente como antes.
create or replace function public.convert_opportunity_to_booking(p_opportunity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.opportunities;
  v_existing_booking_id uuid;
  v_new_booking_id uuid;
  v_has_acceptance boolean;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_opportunity_id::text, 0));

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
  -- recente) de cada chain (categoria, subject_key) — via
  -- get_active_approvals, que já resolve commercial_root_id = a
  -- própria opportunity — conta. Sem exigir subject_key = 'primary'
  -- (correção desta migration): subject_key é texto livre do model,
  -- nunca garantidamente 'primary' mesmo pra categoria singular. Um
  -- registro legado {} (pré correção semântica 16/09/2026) ou
  -- accepted=false nunca passa aqui: approved_value->>'accepted'
  -- distinto de 'true' em texto — fail-closed estrutural preservado.
  select exists (
    select 1
    from public.get_active_approvals(v_opportunity.artist_profile_id, null, p_opportunity_id) ar
    where ar.decision_category = 'accept_or_decline_work'
      and (ar.approved_value ->> 'accepted') = 'true'
  ) into v_has_acceptance;

  if not v_has_acceptance then
    raise exception 'no_canonical_acceptance' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    artist_profile_id, booker_profile_id, status, proposed_by,
    commission_percent, cache_amount_cents, description, event_date,
    client_name, event_location, originated_from_opportunity_id
  ) values (
    v_opportunity.artist_profile_id, null, 'aceita', 'artista',
    0, v_opportunity.cache_amount_cents, v_opportunity.description, v_opportunity.event_date,
    v_opportunity.client_name, v_opportunity.location, p_opportunity_id
  )
  returning id into v_new_booking_id;

  update public.opportunities
  set status = 'convertida'
  where id = p_opportunity_id;

  update public.conversations
  set related_booking_id = v_new_booking_id
  where related_opportunity_id = p_opportunity_id
    and represented_professional_id = v_opportunity.artist_profile_id;

  return v_new_booking_id;
end;
$$;

comment on function public.convert_opportunity_to_booking is 'Direct Booking (16/09/2026, corrigida 21/09/2026) — único caminho de conversão opportunity→booking sem Booker. Só service_role (Runtime) pode chamar — GRANT restrito + is_system_caller() interno, defesa em profundidade. Idempotente (unique index + advisory lock). STOP CONDITION física: só cria Booking com accept_or_decline_work ativo e accepted=true explícito — sem exigir subject_key específico (achado E2E 21/09/2026: subject_key é texto livre do model, nunca garantidamente ''primary''); nunca pela mera existência de uma conversation/opportunity/preço discutido.';

-- create or replace preserva grants existentes (revoke de
-- anon/authenticated, execute só a service_role, já feitos em 0087) —
-- nada a refazer aqui.
