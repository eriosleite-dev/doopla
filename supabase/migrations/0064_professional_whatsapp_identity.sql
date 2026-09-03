-- Doopla Intelligence OS v1 — Professional WhatsApp Identity.
--
-- Fecha o gap registrado desde o começo do projeto: profiles.phone é
-- texto cru, nunca verificado, nunca prova de posse. Esta migration
-- cria o vínculo confiável professional_id <-> verified_whatsapp_number,
-- com OTP de posse real (hash, nunca texto puro), e prepara
-- professional_self pro webhook — sem tocar profiles.phone (que
-- continua existindo, sem relação nenhuma com identidade segura, de
-- propósito: mostrar/editar profiles.phone nunca vira "confiável" por
-- edição simples, exatamente como exigido).
--
-- Princípio central (mantido do WhatsApp Inbound Foundation, nunca
-- regredido): identidade verificada responde QUEM fala, nunca COM QUEM
-- essa pessoa quer falar nesta mensagem específica — o algoritmo de
-- routing (evaluateWhatsappRouting, intake-routing.ts) já foi
-- desenhado pra isso desde 0062 (parâmetro verifiedProfessionalId,
-- nunca usado ainda) — esta migration só passa a POPULAR esse sinal
-- de verdade, nenhuma mudança no algoritmo em si.

-- ============================================================
-- 1. professional_whatsapp_identities — estado ATUAL, um por
--    profissional. "não informado" = nenhuma linha (nunca criada até
--    o primeiro request_whatsapp_verification — um número só digitado
--    e não confirmado não gera NENHUM registro de identidade, de
--    propósito: zero trust, zero motivo de existir no banco).
-- ============================================================
create table public.professional_whatsapp_identities (
  professional_id uuid primary key references public.profiles (id) on delete cascade,

  status text not null default 'unverified'
    check (status in ('unverified', 'pending_verification', 'verified', 'pending_replacement', 'revoked')),

  -- Número ATUALMENTE confiável (populado só em 'verified'/'pending_replacement'
  -- -- numa troca, o número ANTIGO continua confiável até a nova
  -- verificação de fato confirmar, nunca perde confiança no meio do
  -- caminho). Único globalmente: dois profissionais nunca reivindicam
  -- o mesmo número confiável ao mesmo tempo.
  verified_number text,
  verified_at timestamptz,

  -- Número em processo de verificação (primeira vez OU troca).
  candidate_number text,
  candidate_requested_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (status <> 'verified' or verified_number is not null),
  check (status <> 'pending_replacement' or (verified_number is not null and candidate_number is not null)),
  check (status <> 'pending_verification' or candidate_number is not null),
  check (status not in ('unverified', 'revoked') or candidate_number is null)
);

comment on table public.professional_whatsapp_identities is 'Vínculo confiável professional_id <-> verified_whatsapp_number. profiles.phone NUNCA é lido pra decidir isto — só esta tabela, só após OTP confirmado. "informado, não verificado" é estado só de UI (formulário preenchido, nada submetido) — nunca persistido aqui, de propósito: zero trust não gera linha.';

create unique index professional_whatsapp_identities_verified_number_key
  on public.professional_whatsapp_identities (verified_number)
  where verified_number is not null;

create trigger set_updated_at before update on public.professional_whatsapp_identities
  for each row execute function public.set_updated_at();

alter table public.professional_whatsapp_identities enable row level security;

create policy "professional_whatsapp_identities: select own" on public.professional_whatsapp_identities
  for select using (auth.uid() = professional_id);
-- Sem insert/update/delete pra authenticated — só as 3 RPCs abaixo
-- (security definer) escrevem, cada uma revalidando auth.uid() por
-- dentro, nunca confiando em RLS pra isso.

-- ============================================================
-- 2. professional_whatsapp_identity_events — append-only, auditoria
--    mínima. Mesmo padrão de conversation_mandate_events (0039).
-- ============================================================
create table public.professional_whatsapp_identity_events (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('candidate_submitted', 'verified', 'replaced', 'revoked')),
  number text,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);

comment on table public.professional_whatsapp_identity_events is 'Append-only. Nunca UPDATE/DELETE fora de manutenção administrativa direta no banco.';

create index professional_whatsapp_identity_events_professional_idx
  on public.professional_whatsapp_identity_events (professional_id, created_at);

alter table public.professional_whatsapp_identity_events enable row level security;

create policy "professional_whatsapp_identity_events: select own" on public.professional_whatsapp_identity_events
  for select using (auth.uid() = professional_id);

-- ============================================================
-- 3. professional_whatsapp_otp_challenges — nunca código em texto
--    puro (sha256(code || salt por-desafio), nunca reversível). Sem
--    NENHUMA policy pra authenticated/anon: o cliente nunca lê esta
--    tabela direto, só recebe o código (uma vez, na resposta da RPC de
--    request) e o resultado da confirmação (via RPC de confirm).
-- ============================================================
create table public.professional_whatsapp_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  candidate_number text not null,
  code_hash text not null,
  code_salt text not null,

  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'failed', 'superseded')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,

  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

comment on table public.professional_whatsapp_otp_challenges is 'Uso único, expiração, limite de tentativas, sem policy nenhuma pra authenticated/anon — só as RPCs (security definer) leem/escrevem. code_hash nunca é o código puro.';

create unique index professional_whatsapp_otp_challenges_pending_unique_idx
  on public.professional_whatsapp_otp_challenges (professional_id)
  where status = 'pending';

create index professional_whatsapp_otp_challenges_professional_idx
  on public.professional_whatsapp_otp_challenges (professional_id, created_at desc);

alter table public.professional_whatsapp_otp_challenges enable row level security;
-- Sem nenhuma policy — nem select. service_role bypassa RLS mas as
-- RPCs abaixo NUNCA são chamáveis por service_role (só authenticated,
-- auth.uid() = p_professional_id sempre exigido) — "service_role não
-- deve virar atalho inseguro" cumprido estruturalmente, não só por
-- convenção: não há is_system_caller() em nenhuma das 3 functions.

-- ============================================================
-- 4. request_whatsapp_verification — gera o código, hasheia,
--    supersede qualquer challenge pendente anterior, rate-limit
--    (cooldown de reenvio + teto por hora). SÓ authenticated, SÓ em
--    nome de si mesmo — nunca is_system_caller().
-- ============================================================
create function public.request_whatsapp_verification(
  p_professional_id uuid,
  p_candidate_number text
)
returns table (challenge_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_last_created_at timestamptz;
  v_recent_count integer;
  v_code text;
  v_salt text;
  v_hash text;
  v_challenge_id uuid;
  v_expires_at timestamptz;
  v_identity public.professional_whatsapp_identities;
  v_previous_status text;
  v_new_status text;
begin
  if auth.uid() is distinct from p_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_candidate_number is null or p_candidate_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_candidate_number' using errcode = '22023';
  end if;

  -- Proteção contra spam/reenvio: cooldown mínimo entre pedidos...
  select created_at into v_last_created_at from public.professional_whatsapp_otp_challenges
    where professional_id = p_professional_id order by created_at desc limit 1;
  if v_last_created_at is not null and v_last_created_at > now() - interval '45 seconds' then
    raise exception 'resend_too_soon' using errcode = '22023';
  end if;

  -- ...e teto absoluto por hora.
  select count(*) into v_recent_count from public.professional_whatsapp_otp_challenges
    where professional_id = p_professional_id and created_at > now() - interval '1 hour';
  if v_recent_count >= 5 then
    raise exception 'too_many_requests' using errcode = '22023';
  end if;

  -- Só 1 challenge pending por vez — qualquer anterior vira superseded
  -- (nunca confirmável depois, mesmo que o profissional ainda tenha o
  -- código antigo em mãos).
  update public.professional_whatsapp_otp_challenges
    set status = 'superseded'
    where professional_id = p_professional_id and status = 'pending';

  -- Código de 6 dígitos derivado de gen_random_uuid() via sha256 (RNG
  -- criptograficamente forte já nativo do Postgres, nunca random()
  -- puro). Hash com salt por-desafio, nunca reversível, nunca
  -- reaproveitado entre desafios.
  v_code := lpad((('x' || substr(encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 1, 8))::bit(32)::bigint % 900000 + 100000)::text, 6, '0');
  v_salt := encode(sha256(gen_random_uuid()::text::bytea), 'hex');
  v_hash := encode(sha256((v_code || v_salt)::bytea), 'hex');
  v_expires_at := now() + interval '10 minutes';

  insert into public.professional_whatsapp_otp_challenges (professional_id, candidate_number, code_hash, code_salt, expires_at)
  values (p_professional_id, p_candidate_number, v_hash, v_salt, v_expires_at)
  returning id into v_challenge_id;

  select * into v_identity from public.professional_whatsapp_identities where professional_id = p_professional_id;
  v_previous_status := coalesce(v_identity.status, 'unverified');
  v_new_status := case
    when v_identity.status = 'verified' and v_identity.verified_number is distinct from p_candidate_number then 'pending_replacement'
    else 'pending_verification'
  end;

  insert into public.professional_whatsapp_identities (professional_id, status, candidate_number, candidate_requested_at, verified_number, verified_at)
  values (p_professional_id, v_new_status, p_candidate_number, now(), v_identity.verified_number, v_identity.verified_at)
  on conflict (professional_id) do update set
    status = excluded.status,
    candidate_number = excluded.candidate_number,
    candidate_requested_at = excluded.candidate_requested_at,
    updated_at = now();

  insert into public.professional_whatsapp_identity_events (professional_id, event_type, number, previous_status, new_status)
  values (p_professional_id, 'candidate_submitted', p_candidate_number, v_previous_status, v_new_status);

  return query select v_challenge_id, v_code, v_expires_at;
end;
$$;

comment on function public.request_whatsapp_verification is 'Único caminho de emissão de OTP. Nunca is_system_caller() — sempre auth.uid() = p_professional_id, sempre uma ação da própria sessão do profissional. O código só existe em texto puro no valor de retorno desta chamada (pro caller mandar via WhatsApp) — nunca gravado sem hash.';

revoke all on function public.request_whatsapp_verification from public;
grant execute on function public.request_whatsapp_verification to authenticated;
revoke execute on function public.request_whatsapp_verification from anon, service_role;

-- ============================================================
-- 5. confirm_whatsapp_verification — uso único, expiração, limite de
--    tentativas, idempotente (retry da mesma confirmação bem-sucedida
--    nunca contradiz nem duplica). Colisão de número entre dois
--    profissionais tratada explicitamente via captura do unique_violation
--    do índice único de verified_number.
-- ============================================================
create function public.confirm_whatsapp_verification(
  p_professional_id uuid,
  p_code text
)
returns table (confirmed boolean, reason text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_challenge public.professional_whatsapp_otp_challenges;
  v_identity public.professional_whatsapp_identities;
  v_hash text;
  v_old_number text;
begin
  if auth.uid() is distinct from p_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_challenge from public.professional_whatsapp_otp_challenges
    where professional_id = p_professional_id and status in ('pending', 'confirmed')
    order by created_at desc limit 1
    for update;

  if not found then
    return query select false, 'no_pending_challenge';
    return;
  end if;

  if v_challenge.status = 'confirmed' then
    -- Idempotente: confirmação repetida da mesma linha já concluída
    -- nunca reprocessa, nunca contradiz o sucesso anterior.
    return query select true, null::text;
    return;
  end if;

  if v_challenge.expires_at < now() then
    update public.professional_whatsapp_otp_challenges set status = 'expired' where id = v_challenge.id;
    return query select false, 'expired';
    return;
  end if;

  if v_challenge.attempt_count >= v_challenge.max_attempts then
    update public.professional_whatsapp_otp_challenges set status = 'failed' where id = v_challenge.id;
    return query select false, 'too_many_attempts';
    return;
  end if;

  v_hash := encode(sha256((p_code || v_challenge.code_salt)::bytea), 'hex');

  if v_hash is distinct from v_challenge.code_hash then
    update public.professional_whatsapp_otp_challenges
      set attempt_count = attempt_count + 1,
          status = case when attempt_count + 1 >= max_attempts then 'failed' else status end
      where id = v_challenge.id;
    -- A tentativa que ESGOTA o teto já devolve o motivo terminal
    -- (nunca "invalid_code" só pra essa última, que seria enganoso —
    -- o profissional precisa saber, já nesta resposta, que acabou de
    -- travar, não que "só" errou de novo).
    if v_challenge.attempt_count + 1 >= v_challenge.max_attempts then
      return query select false, 'too_many_attempts';
    else
      return query select false, 'invalid_code';
    end if;
    return;
  end if;

  select * into v_identity from public.professional_whatsapp_identities where professional_id = p_professional_id for update;
  v_old_number := v_identity.verified_number;

  begin
    update public.professional_whatsapp_identities
      set status = 'verified', verified_number = v_challenge.candidate_number, verified_at = now(),
          candidate_number = null, candidate_requested_at = null, updated_at = now()
      where professional_id = p_professional_id;
  exception when unique_violation then
    -- Outro profissional já confirmou este MESMO número entre o
    -- envio do código e esta confirmação — comportamento explícito,
    -- nunca uma exceção não tratada, nunca um vínculo silenciosamente
    -- incorreto.
    update public.professional_whatsapp_otp_challenges set status = 'failed' where id = v_challenge.id;
    return query select false, 'number_claimed_by_another_professional';
    return;
  end;

  update public.professional_whatsapp_otp_challenges set status = 'confirmed', confirmed_at = now() where id = v_challenge.id;

  if v_old_number is not null and v_old_number is distinct from v_challenge.candidate_number then
    insert into public.professional_whatsapp_identity_events (professional_id, event_type, number, previous_status, new_status)
    values (p_professional_id, 'replaced', v_old_number, 'verified', 'verified');
  end if;
  insert into public.professional_whatsapp_identity_events (professional_id, event_type, number, previous_status, new_status)
  values (p_professional_id, 'verified', v_challenge.candidate_number, coalesce(v_identity.status, 'unverified'), 'verified');

  return query select true, null::text;
end;
$$;

comment on function public.confirm_whatsapp_verification is 'Único caminho de confirmação. for update na linha do challenge serializa tentativas concorrentes da mesma linha — nunca dois vínculos, nunca estado contraditório. Nunca is_system_caller().';

revoke all on function public.confirm_whatsapp_verification from public;
grant execute on function public.confirm_whatsapp_verification to authenticated;
revoke execute on function public.confirm_whatsapp_verification from anon, service_role;

-- ============================================================
-- 6. revoke_whatsapp_verification — remoção explícita, sem
--    substituição. Número antigo deixa de ser confiável IMEDIATAMENTE
--    (nunca um estado intermediário "ainda confiando por engano").
-- ============================================================
create function public.revoke_whatsapp_verification(p_professional_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_identity public.professional_whatsapp_identities;
begin
  if auth.uid() is distinct from p_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_identity from public.professional_whatsapp_identities where professional_id = p_professional_id for update;
  if not found or v_identity.verified_number is null then
    return false;
  end if;

  update public.professional_whatsapp_identities
    set status = 'revoked', verified_number = null, verified_at = null,
        candidate_number = null, candidate_requested_at = null, updated_at = now()
    where professional_id = p_professional_id;

  update public.professional_whatsapp_otp_challenges
    set status = 'superseded'
    where professional_id = p_professional_id and status = 'pending';

  insert into public.professional_whatsapp_identity_events (professional_id, event_type, number, previous_status, new_status)
  values (p_professional_id, 'revoked', v_identity.verified_number, v_identity.status, 'revoked');

  return true;
end;
$$;

comment on function public.revoke_whatsapp_verification is 'Remoção explícita do vínculo confiável, sem substituição. verified_number some da linha atomicamente com a mudança de status — nunca uma janela onde o número antigo ainda parece confiável.';

revoke all on function public.revoke_whatsapp_verification from public;
grant execute on function public.revoke_whatsapp_verification to authenticated;
revoke execute on function public.revoke_whatsapp_verification from anon, service_role;

-- ============================================================
-- 7. create_conversation — extensão aditiva (mesma assinatura de
--    0062, CREATE OR REPLACE limpo): reuso idempotente também pro caso
--    professional_self (sem external_participant_id), sob advisory
--    lock por professional_id sozinho — fecha a mesma classe de
--    corrida já fechada em 0062 pro caso external_inquiry.
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

  if not v_is_system and auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

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
  elsif v_is_system and p_conversation_type = 'professional_self' then
    v_lock_key := hashtextextended(p_represented_professional_id::text || '|professional_self', 45);
    perform pg_advisory_xact_lock(v_lock_key);

    select * into v_conversation
    from public.conversations
    where represented_professional_id = p_represented_professional_id
      and conversation_type = 'professional_self'
    order by created_at desc
    limit 1;

    if found then
      return v_conversation;
    end if;
  end if;

  insert into public.conversations (
    represented_professional_id, conversation_type, external_participant_id,
    origin, origin_reference, channel,
    mandate, mandate_created_at,
    current_state, previous_state, state_updated_at,
    transferred_from_conversation_id
  ) values (
    p_represented_professional_id, p_conversation_type, p_external_participant_id,
    p_origin, p_origin_reference, coalesce(p_channel, p_origin),
    p_initial_mandate, now(),
    p_initial_state, null, now(),
    p_transferred_from_conversation_id
  )
  returning * into v_conversation;

  insert into public.conversation_mandate_events (
    conversation_id, previous_mandate, new_mandate, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_mandate, 'conversa criada', case when v_is_system then 'system' else 'professional' end, auth.uid()
  );

  insert into public.conversation_state_events (
    conversation_id, previous_state, new_state, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_state, 'conversa criada', case when v_is_system then 'system' else 'professional' end, auth.uid()
  );

  return v_conversation;
end;
$$;

comment on function public.create_conversation is 'Único caminho de criação de conversation. is_system_caller() (0062) idempotente sob advisory lock pros dois casos: par (professional, external_participant) e professional_self (0064, novo). Sempre gera, na mesma transação, a linha da conversa e os dois eventos de nascimento.';
