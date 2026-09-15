-- Item 1 aprovado pela fundadora (15/09/2026) — "Link de booking ->
-- Conversation": um pedido recebido por /orcamento/[slug] passa a
-- entrar no mesmo ciclo operacional da Doopla que WhatsApp (Bookings
-- unificado, doopla-intervention.ts). Auditoria prévia (registrada em
-- PROGRESS.md) identificou o bloqueio real: create_conversation()
-- exige auth.uid() = profissional OU is_system_caller() (service_role,
-- migration 0062) — o formulário público roda anônimo, sem nenhum dos
-- dois, então chamar a RPC pública direto de dentro de
-- submit_orcamento_request falharia com not_authorized. A solução
-- aprovada: extrair o núcleo de escrita (conversa + os 2 eventos de
-- nascimento, sempre atômicos) pra uma function interna sem NENHUM
-- grant a anon/authenticated/public — só chamável função-a-função por
-- outra SECURITY DEFINER já confiável (submit_orcamento_request, que
-- já resolve o profissional de forma determinística pelo slug, nunca
-- por identidade informada pelo cliente). create_conversation() (a RPC
-- pública) mantém 100% das checagens/comportamento atuais — só passou
-- a delegar a escrita final pro mesmo núcleo, nunca uma segunda cópia
-- da lógica "conversa + eventos".
--
-- Nenhuma capacidade nova pra anon: o caller anônimo continua sem
-- poder chamar create_conversation() (só authenticated/service_role
-- têm EXECUTE, inalterado) e nunca ganha EXECUTE no núcleo novo. O
-- caminho novo só existe DENTRO de submit_orcamento_request, que já é
-- SECURITY DEFINER e já tinha privilégio de tabela suficiente pra
-- fazer isso via insert cru — a única coisa que mudou é reusar o
-- núcleo em vez de duplicar a lógica de eventos.

-- ============================================================
-- 1. _create_conversation_core — núcleo interno (prefixo `_` = nunca
--    exposto via API). Mesmo insert atômico (conversa + 2 eventos de
--    nascimento) que já vivia dentro de create_conversation() (0039/
--    0062), só que parametrizado o suficiente pra também aceitar
--    related_opportunity_id/related_booking_id na criação (create_conversation
--    nunca passa esses dois — continua nascendo sempre unrelated, como
--    hoje) e changed_by/changed_by_profile_id explícitos (quem chama
--    decide, nunca um auth.uid()/is_system_caller() recomputado aqui —
--    essa validação é responsabilidade de quem chama este núcleo).
-- ============================================================
create function public._create_conversation_core(
  p_represented_professional_id uuid,
  p_conversation_type text,
  p_external_participant_id uuid,
  p_origin text,
  p_origin_reference text,
  p_channel text,
  p_initial_mandate text,
  p_initial_state text,
  p_transferred_from_conversation_id uuid,
  p_related_opportunity_id uuid default null,
  p_related_booking_id uuid default null,
  p_changed_by text default 'system',
  p_changed_by_profile_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
begin
  insert into public.conversations (
    represented_professional_id, conversation_type, external_participant_id,
    origin, origin_reference, channel,
    mandate, mandate_created_at,
    current_state, previous_state, state_updated_at,
    transferred_from_conversation_id,
    related_opportunity_id, related_booking_id
  ) values (
    p_represented_professional_id, p_conversation_type, p_external_participant_id,
    p_origin, p_origin_reference, coalesce(p_channel, p_origin),
    p_initial_mandate, now(),
    p_initial_state, null, now(),
    p_transferred_from_conversation_id,
    p_related_opportunity_id, p_related_booking_id
  )
  returning * into v_conversation;

  insert into public.conversation_mandate_events (
    conversation_id, previous_mandate, new_mandate, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_mandate, 'conversa criada', p_changed_by, p_changed_by_profile_id
  );

  insert into public.conversation_state_events (
    conversation_id, previous_state, new_state, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_state, 'conversa criada', p_changed_by, p_changed_by_profile_id
  );

  return v_conversation;
end;
$$;

comment on function public._create_conversation_core is 'Núcleo interno (prefixo _ = nunca exposto via API) de criação de conversation — extraído de create_conversation() (0039/0062) pra permitir um segundo chamador confiável (submit_orcamento_request, 0023) sem duplicar "conversa + 2 eventos de nascimento sempre atômicos" nem reabrir a checagem de auth.uid()/is_system_caller(). Essa validação continua 100% em create_conversation() — quem chama este núcleo diretamente precisa já ter resolvido a identidade do profissional de forma determinística e auditável (submit_orcamento_request resolve via slug público, nunca por identidade informada pelo cliente). NUNCA GRANT a anon/authenticated/public — só alcançável função-a-função, sob o privilégio de quem chama (SECURITY DEFINER).';

-- pg_default_acl deste projeto auto-concede EXECUTE a anon em toda
-- function nova (achado real, migrations 0051+) — revoke de public
-- sozinho não bloqueia anon, precisa ser explícito, igual todo outro
-- núcleo privado deste projeto.
revoke all on function public._create_conversation_core from public;
revoke execute on function public._create_conversation_core from anon, authenticated;

-- ============================================================
-- 2. create_conversation — passa a delegar a escrita final pro
--    núcleo acima. Assinatura, grants e TODAS as checagens de
--    autorização/idempotência permanecem exatamente como em 0062 —
--    zero mudança de comportamento pros chamadores existentes (Web
--    autenticado, webhook de WhatsApp via service_role).
-- ============================================================
create or replace function public.create_conversation(
  p_represented_professional_id uuid,
  p_conversation_type text default 'external_inquiry',
  p_external_participant_id uuid default null,
  p_origin text default 'painel',
  p_origin_reference text default null,
  p_channel text default null,
  p_initial_mandate text default 'active',
  p_initial_state text default 'novo',
  p_transferred_from_conversation_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_is_system boolean;
  v_lock_key bigint;
begin
  v_is_system := public.is_system_caller();

  -- Caminho humano autenticado: inalterado, continua exigindo
  -- auth.uid() = p_represented_professional_id. Caminho de sistema
  -- (service_role, ex.: webhook resolvendo um intake): condição
  -- ADICIONAL, nunca uma segunda forma de um client comum se passar
  -- por outro profissional.
  if not v_is_system and auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

  -- Idempotência do ramo de sistema: reaproveita se já existir QUALQUER
  -- conversa pro mesmo par (professional, participante) — inalterado.
  if v_is_system and p_external_participant_id is not null then
    v_lock_key := hashtextextended(p_represented_professional_id::text || '|' || p_external_participant_id::text, 44);
    perform pg_advisory_xact_lock(v_lock_key);

    select * into v_conversation
    from public.conversations
    where represented_professional_id = p_represented_professional_id
      and external_participant_id = p_external_participant_id
    order by created_at desc
    limit 1;

    if found then
      return v_conversation;
    end if;
  end if;

  return public._create_conversation_core(
    p_represented_professional_id => p_represented_professional_id,
    p_conversation_type => p_conversation_type,
    p_external_participant_id => p_external_participant_id,
    p_origin => p_origin,
    p_origin_reference => p_origin_reference,
    p_channel => p_channel,
    p_initial_mandate => p_initial_mandate,
    p_initial_state => p_initial_state,
    p_transferred_from_conversation_id => p_transferred_from_conversation_id,
    p_changed_by => case when v_is_system then 'system' else 'professional' end,
    p_changed_by_profile_id => auth.uid()
  );
end;
$$;

comment on function public.create_conversation is 'Único caminho de criação de conversation via API. Estendida (0062) com is_system_caller() — condição ADICIONAL a auth.uid(), nunca substituindo. Estendida (0082) delegando a escrita final a _create_conversation_core() — mesmo comportamento/contrato, agora reaproveitado também por submit_orcamento_request (0082) sem duplicar a lógica. Ramo de sistema idempotente sob advisory lock por (professional_id, external_participant_id). Sempre gera, na mesma transação, a linha da conversa e os dois eventos de nascimento.';

-- Grants inalterados (create or replace nunca reseta grants — mesmo
-- authenticated/service_role de sempre, anon continua sem EXECUTE).

-- ============================================================
-- 3. submit_orcamento_request — passa a criar a conversation
--    correspondente na MESMA transação, logo após criar a
--    opportunity, chamando o núcleo interno diretamente (nunca a RPC
--    pública create_conversation(), que exigiria auth.uid()/
--    is_system_caller() — nenhum dos dois existe numa chamada anônima
--    do formulário público). origin/channel='public_link',
--    related_opportunity_id vinculado à oportunidade recém-criada,
--    changed_by='system' (ninguém autenticado agiu; é a Doopla
--    processando uma entrada pública).
--
-- external_participant_id continua null nesta rodada: client_contact
-- hoje é um único campo livre ("telefone ou e-mail"), sem separação
-- estrutural entre os dois tipos de canal — resolver/criar um
-- external_participant exigiria adivinhar o tipo por heurística, que
-- foi explicitamente descartado (auditoria em PROGRESS.md). Fica
-- registrado como pendência com a menor correção necessária: separar
-- o campo em dois (ou marcar o tipo explicitamente) antes de tentar
-- resolver participante aqui.
-- ============================================================
create or replace function public.submit_orcamento_request(
  p_artist_slug text,
  p_description text,
  p_client_name text,
  p_client_contact text,
  p_event_date date,
  p_location text,
  p_offered_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
  v_public_enabled boolean;
  v_routing public.artist_link_routing;
  v_assigned_to text;
  v_opportunity_id uuid;
begin
  select p.id, ap.public_enabled into v_artist_id, v_public_enabled
  from public.profiles p
  join public.artist_profiles ap on ap.profile_id = p.id
  where p.slug = p_artist_slug;

  if v_artist_id is null or not coalesce(v_public_enabled, false) then
    raise exception 'artist_not_found' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_client_name), '') = '' then
    raise exception 'client_name_required' using errcode = 'P0001';
  end if;

  select * into v_routing from public.artist_link_routing where artist_id = v_artist_id;

  if v_routing is null or v_routing.mode = 'eu' then
    v_assigned_to := 'artist';
  elsif v_routing.mode = 'meu_booker' then
    v_assigned_to := 'booker';
  else
    v_assigned_to := 'shared';
  end if;

  insert into public.opportunities (
    artist_profile_id, description, commission_percent, distribution_mode,
    status, source, assigned_to, client_name, client_contact, event_date,
    location, client_offered_cents
  ) values (
    v_artist_id, coalesce(nullif(trim(p_description), ''), 'Solicitação recebida pelo link de orçamento'),
    null, 'meus_bookers', 'aberta', 'artist_link', v_assigned_to, p_client_name, p_client_contact,
    p_event_date, p_location, p_offered_cents
  )
  returning id into v_opportunity_id;

  if v_assigned_to in ('booker', 'shared') and v_routing.booker_id is not null then
    insert into public.opportunity_invitations (opportunity_id, booker_profile_id)
    values (v_opportunity_id, v_routing.booker_id)
    on conflict (opportunity_id, booker_profile_id) do nothing;
  end if;

  perform public._create_conversation_core(
    p_represented_professional_id => v_artist_id,
    p_conversation_type => 'external_inquiry',
    p_external_participant_id => null,
    p_origin => 'public_link',
    p_origin_reference => p_artist_slug,
    p_channel => 'public_link',
    p_initial_mandate => 'active',
    p_initial_state => 'novo',
    p_transferred_from_conversation_id => null,
    p_related_opportunity_id => v_opportunity_id,
    p_related_booking_id => null,
    p_changed_by => 'system',
    p_changed_by_profile_id => null
  );

  return v_opportunity_id;
end;
$$;

comment on function public.submit_orcamento_request is 'Único caminho público de criação de oportunidade a partir do link /orçamento. commission_percent nasce nulo (ainda não negociada) — distinto de client_offered_cents, que é só o valor que o cliente propôs. Estendida (0082) pra também criar, na mesma transação, a conversation correspondente (origin/channel=public_link, related_opportunity_id vinculado) via _create_conversation_core — mesmo ciclo operacional que WhatsApp já tinha. external_participant_id nasce null (client_contact é campo livre ambíguo hoje — ver comentário da migration).';
