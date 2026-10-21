-- Doopla Intelligence Core v1 — ADR 0004, Rodada 4/5 (15/10/2026):
-- proteção mínima de opt-in antes de abordagens comerciais pelo
-- WhatsApp. Achado real da auditoria (ADR 0004, Rodada 4, seção 1):
-- "Doopla chama o cliente" nunca verificou autorização do
-- DESTINATÁRIO antes do primeiro template — só a aprovação da própria
-- profissional. checkRecipientConsent (migration 0109) só lê a
-- resposta DEPOIS do template já enviado; nunca foi, nem deveria ser
-- confundido com, opt-in prévio.
--
-- Duas peças novas, nenhuma reescreve o que já existe:
--
-- 1. whatsapp_outreach_authorization_claims — a ATESTAÇÃO da
--    profissional de que já tem base pra contatar aquele telefone
--    (cliente que já conversou fora da Doopla, pediu o contato, etc.).
--    ATENÇÃO, repetido no comment da tabela: isto NUNCA é consentimento
--    do destinatário — é só o registro de que a profissional declarou
--    ter uma base, com origem/finalidade/data/evidência (requisito 2
--    da fundadora). O consentimento real do destinatário continua
--    inteiramente em checkRecipientConsent, intocado.
--
-- 2. whatsapp_outreach_blocklist — registro DURÁVEL de recusa/bloqueio,
--    separado da memória de contatos (requisito 4), escopado só por
--    TELEFONE (nunca por profissional — requisito 6: o número oficial
--    da Doopla é compartilhado entre artistas, então uma recusa bloqueia
--    TODO pedido futuro pro mesmo telefone, de qualquer profissional,
--    nunca só do profissional que recebeu a recusa). Decisão
--    deliberadamente conservadora: nunca tentamos classificar se uma
--    recusa era "só desse pedido" ou "bloqueio geral" — qualquer
--    outcome='declined' de checkRecipientConsent sempre bloqueia o
--    número inteiro, erra sempre pro lado mais seguro.
--
-- pending_delegated_contacts ganha dois status novos (CHECK aditivo,
-- mesmo padrão da 0109): 'pending_authorization' (aguardando a
-- profissional confirmar que tem base pra contatar, quando nenhuma
-- claim existe ainda) e 'blocked_unauthorized' (terminal — bloqueado
-- pela blocklist OU a profissional não confirmou ter autorização).
-- Reaproveita as MESMAS colunas confirmation_message_id/
-- decision_message_id já existentes pra correlação (nunca cria um
-- par novo — os dois gates nunca ficam abertos ao mesmo tempo pra
-- uma mesma linha, a autorização sempre resolve antes da aprovação
-- de conteúdo).

-- ============================================================
-- 1. whatsapp_outreach_authorization_claims
-- ============================================================
create table public.whatsapp_outreach_authorization_claims (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  phone_number text not null,
  pending_delegated_contact_id uuid references public.pending_delegated_contacts (id) on delete set null,
  -- Só UM valor nesta rodada, de propósito — nunca tentamos classificar
  -- a NATUREZA da base alegada a partir de texto livre (risco real de
  -- classificação errada). O campo existe pra registrar formalmente que
  -- uma atestação aconteceu, não pra diferenciar tipos de base ainda.
  claimed_basis text not null default 'professional_attestation' check (claimed_basis = 'professional_attestation'),
  purpose_summary text,
  evidence_message_id uuid references public.conversation_messages (id) on delete set null,
  claimed_at timestamptz not null default now(),
  unique (professional_id, phone_number)
);

comment on table public.whatsapp_outreach_authorization_claims is 'ATESTAÇÃO da profissional de que tem base pra contatar este telefone — NUNCA consentimento verificado do destinatário (isso é checkRecipientConsent, migration 0109, lido só DEPOIS do primeiro template). Existência de uma linha aqui só significa "a profissional declarou ter autorização", nunca "o destinatário autorizou". Dedup por (professional_id, phone_number): uma vez atestado, pedidos futuros pro mesmo contato nunca perguntam de novo.';

create index whatsapp_outreach_authorization_claims_professional_phone_idx
  on public.whatsapp_outreach_authorization_claims (professional_id, phone_number);

alter table public.whatsapp_outreach_authorization_claims enable row level security;
-- Sem policy pra authenticated/anon — mesmo padrão de pending_delegated_contacts.

-- ============================================================
-- 2. whatsapp_outreach_blocklist — escopo GLOBAL por telefone
-- ============================================================
create table public.whatsapp_outreach_blocklist (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  blocked_at timestamptz not null default now(),
  source_pending_delegated_contact_id uuid references public.pending_delegated_contacts (id) on delete set null,
  source_message_id uuid references public.conversation_messages (id) on delete set null,
  reason text not null default 'declined_first_reply'
);

comment on table public.whatsapp_outreach_blocklist is 'Bloqueio DURÁVEL e GLOBAL por telefone (nunca escopado por profissional — o número oficial da Doopla é compartilhado entre artistas; ver ADR 0004, Rodada 5, requisito 6). Checado em DOIS pontos: antes de criar o outbound_intent do template (executeTemplateSend) e de novo no momento real do envio (send-outbound-intents), nunca só uma vez. Separado de professional_contact_memories de propósito (requisito 4) — memorizar um contato nunca remove um bloqueio, e um bloqueio nunca é escrito na tabela de memória.';

alter table public.whatsapp_outreach_blocklist enable row level security;

-- ============================================================
-- 3. RPCs
-- ============================================================

create function public.create_whatsapp_outreach_authorization_claim(
  p_professional_id uuid,
  p_phone_number text,
  p_pending_delegated_contact_id uuid,
  p_purpose_summary text,
  p_evidence_message_id uuid
)
returns public.whatsapp_outreach_authorization_claims
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.whatsapp_outreach_authorization_claims;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.whatsapp_outreach_authorization_claims (professional_id, phone_number, pending_delegated_contact_id, purpose_summary, evidence_message_id)
  values (p_professional_id, p_phone_number, p_pending_delegated_contact_id, p_purpose_summary, p_evidence_message_id)
  on conflict (professional_id, phone_number) do update
    -- Idempotente: uma segunda atestação pro mesmo par nunca perde a
    -- primeira evidência silenciosamente, só atualiza o resumo/evidência
    -- mais recente (nunca duas linhas pro mesmo par).
    set purpose_summary = coalesce(excluded.purpose_summary, whatsapp_outreach_authorization_claims.purpose_summary),
        evidence_message_id = excluded.evidence_message_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_whatsapp_outreach_authorization_claim is 'Único jeito de uma atestação de autorização nascer. NUNCA chamar isto achando que registra consentimento do destinatário — é só a declaração da profissional.';

revoke all on function public.create_whatsapp_outreach_authorization_claim from public;
grant execute on function public.create_whatsapp_outreach_authorization_claim to service_role;
revoke execute on function public.create_whatsapp_outreach_authorization_claim from anon, authenticated;

create function public.find_whatsapp_outreach_authorization_claim(
  p_professional_id uuid,
  p_phone_number text
)
returns public.whatsapp_outreach_authorization_claims
language sql
security definer set search_path = public
stable
as $$
  select * from public.whatsapp_outreach_authorization_claims
  where professional_id = p_professional_id and phone_number = p_phone_number
  limit 1;
$$;

revoke all on function public.find_whatsapp_outreach_authorization_claim from public;
grant execute on function public.find_whatsapp_outreach_authorization_claim to service_role;
revoke execute on function public.find_whatsapp_outreach_authorization_claim from anon, authenticated;

create function public.create_whatsapp_outreach_block(
  p_phone_number text,
  p_source_pending_delegated_contact_id uuid default null,
  p_source_message_id uuid default null,
  p_reason text default 'declined_first_reply'
)
returns public.whatsapp_outreach_blocklist
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.whatsapp_outreach_blocklist;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.whatsapp_outreach_blocklist (phone_number, source_pending_delegated_contact_id, source_message_id, reason)
  values (p_phone_number, p_source_pending_delegated_contact_id, p_source_message_id, p_reason)
  -- Idempotente: uma segunda recusa do mesmo telefone nunca duplica a
  -- linha nem apaga a origem da primeira (o bloqueio já existia).
  on conflict (phone_number) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.whatsapp_outreach_blocklist where phone_number = p_phone_number;
  end if;

  return v_row;
end;
$$;

comment on function public.create_whatsapp_outreach_block is 'Único jeito de um bloqueio nascer. Global por telefone, nunca por profissional (requisito 6, ADR 0004 Rodada 5) — uma recusa de QUALQUER pedido bloqueia QUALQUER pedido futuro pro mesmo telefone.';

revoke all on function public.create_whatsapp_outreach_block from public;
grant execute on function public.create_whatsapp_outreach_block to service_role;
revoke execute on function public.create_whatsapp_outreach_block from anon, authenticated;

create function public.is_whatsapp_outreach_blocked(p_phone_number text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.whatsapp_outreach_blocklist where phone_number = p_phone_number);
$$;

comment on function public.is_whatsapp_outreach_blocked is 'Checagem de bloqueio — chamada em DOIS pontos (requisito 7): antes de criar o outbound_intent do template (executeTemplateSend) e de novo no momento real do envio à Meta (send-outbound-intents), cobrindo tanto uma recusa que chegou no meio do caminho quanto uma mensagem já enfileirada antes do bloqueio existir (requisito 5).';

revoke all on function public.is_whatsapp_outreach_blocked from public;
grant execute on function public.is_whatsapp_outreach_blocked to service_role;
revoke execute on function public.is_whatsapp_outreach_blocked from anon, authenticated;

-- ============================================================
-- 4. pending_delegated_contacts — dois status novos (CHECK aditivo)
-- ============================================================
alter table public.pending_delegated_contacts
  drop constraint pending_delegated_contacts_status_check;
alter table public.pending_delegated_contacts
  add constraint pending_delegated_contacts_status_check
  check (status in (
    'pending_number',
    -- novo: aguardando a profissional confirmar que já tem base pra
    -- contatar este telefone, porque nenhuma whatsapp_outreach_authorization_claims
    -- existe ainda pro par (profissional, telefone). Reaproveita
    -- confirmation_message_id/decision_message_id (mesmas colunas do
    -- gate de aprovação de conteúdo) — os dois gates nunca ficam
    -- abertos ao mesmo tempo pra uma mesma linha.
    'pending_authorization',
    'pending_approval', 'approved', 'executing',
    'rejected', 'cancelled', 'expired', 'expired_no_reply',
    -- novo: terminal — bloqueado pela blocklist OU a profissional
    -- respondeu que não tem autorização pra este contato (ofereceu-se
    -- a alternativa de convite por link nesse caso). Nunca reaberto
    -- automaticamente; um pedido novo pode ser criado depois se a
    -- profissional conseguir autorização.
    'blocked_unauthorized',
    'executed', 'failed'
  ));

comment on column public.pending_delegated_contacts.status is 'pending_number: falta o telefone. pending_authorization (novo): falta confirmar que a profissional tem base pra contatar (nenhuma authorization_claim ainda). pending_approval: aguardando sim/não pro conteúdo exato. approved/executing: claim/execução do template. blocked_unauthorized (novo, terminal): bloqueado pela blocklist ou autorização não confirmada. rejected/cancelled/expired/expired_no_reply: terminais sem envio. executed: outbound_intent do template criado. failed: execução tentada e falhou.';

-- ============================================================
-- 5. Gate de autorização — arma/decide, mesmo padrão exato do gate de
--    aprovação de conteúdo (prepare_pending_delegated_contact_approval/
--    claim_pending_delegated_contact_decision, migration 0104),
--    reaproveitando as MESMAS colunas de correlação.
-- ============================================================

create function public.prepare_pending_delegated_contact_authorization_review(
  p_id uuid,
  p_confirmation_message_id uuid,
  p_draft_message_content text default null
)
returns public.pending_delegated_contacts
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Achado real (teste de integração, 15/10/2026): sem persistir
  -- draft_message_content aqui, o texto que a profissional já tinha
  -- dado no mesmo turno do pedido se perdia entre a pergunta de
  -- autorização e a pergunta de conteúdo (um turno inteiro depois) —
  -- só existia na closure em memória do primeiro turno, nunca
  -- sobrevivia a uma segunda requisição HTTP. coalesce: nunca
  -- sobrescreve com null um valor já gravado antes.
  update public.pending_delegated_contacts
  set confirmation_message_id = p_confirmation_message_id,
      decision_message_id = null,
      status = 'pending_authorization',
      draft_message_content = coalesce(p_draft_message_content, draft_message_content)
  where id = p_id
    and status in ('pending_number', 'pending_authorization')
  returning * into v_row;

  if not found then
    raise exception 'pending_delegated_contact_not_preparable_for_authorization' using errcode = 'P0001';
  end if;

  return v_row;
end;
$$;

comment on function public.prepare_pending_delegated_contact_authorization_review is 'Arma a pergunta "você já tem autorização pra contatar esta pessoa?" — só quando recipient_number+draft_message_content já são conhecidos e nenhuma whatsapp_outreach_authorization_claims existe pro par (checagem feita em TS antes de chamar esta function, nunca aqui). Nunca avança sozinha pra pending_approval — quem decide é claim_pending_delegated_contact_authorization_decision.';

revoke all on function public.prepare_pending_delegated_contact_authorization_review from public;
grant execute on function public.prepare_pending_delegated_contact_authorization_review to service_role;
revoke execute on function public.prepare_pending_delegated_contact_authorization_review from anon, authenticated;

create function public.claim_pending_delegated_contact_authorization_decision(
  p_id uuid,
  p_expected_confirmation_message_id uuid,
  p_decision_message_id uuid,
  p_confirmed boolean
)
returns table (
  granted boolean,
  requesting_professional_id uuid,
  recipient_number text,
  purpose_summary text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.pending_delegated_contacts;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = case when p_confirmed then 'pending_approval' else 'blocked_unauthorized' end,
      decision_message_id = p_decision_message_id,
      resolved_at = case when p_confirmed then null else now() end
  where id = p_id
    and status = 'pending_authorization'
    and confirmation_message_id = p_expected_confirmation_message_id
  returning * into v_row;

  if not found then
    return query select false, null::uuid, null::text, null::text;
    return;
  end if;

  return query select true, v_row.requesting_professional_id, v_row.recipient_number, v_row.purpose_summary;
end;
$$;

comment on function public.claim_pending_delegated_contact_authorization_decision is 'Claim atômico do gate de autorização, mesmo padrão de claim_pending_delegated_contact_decision. Confirmado=true -> volta pra pending_approval (segue pro gate de conteúdo de sempre, SEM criar outbound_intent aqui). Confirmado=false -> blocked_unauthorized, terminal (TS oferece a alternativa de convite por link, nunca tenta de novo automaticamente).';

revoke all on function public.claim_pending_delegated_contact_authorization_decision from public;
grant execute on function public.claim_pending_delegated_contact_authorization_decision to service_role;
revoke execute on function public.claim_pending_delegated_contact_authorization_decision from anon, authenticated;

-- Transição direta, sem claim de decisão (nenhuma pergunta foi feita
-- ainda — isto dispara ANTES de perguntar qualquer coisa, no instante
-- em que a blocklist já bloqueia o telefone). Guard por status IN (...)
-- evita regredir um pedido que já avançou além do ponto onde esta
-- checagem roda.
create function public.mark_pending_delegated_contact_blocked_unauthorized(p_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'blocked_unauthorized', resolved_at = now()
  -- 'executing' incluso pro recheck de bloqueio DENTRO de
  -- executeTemplateSend (requisito 7, re-checagem no momento efetivo
  -- do envio) — o claim atômico já moveu o status pra 'executing'
  -- antes desse recheck rodar.
  where id = p_id and status in ('pending_number', 'pending_authorization', 'pending_approval', 'executing');

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.mark_pending_delegated_contact_blocked_unauthorized is 'Marca blocked_unauthorized diretamente (sem gate de decisão) quando a blocklist já bloqueia o telefone — chamada antes de qualquer pergunta ser feita OU dentro de executeTemplateSend como recheck final (status executing).';

revoke all on function public.mark_pending_delegated_contact_blocked_unauthorized from public;
grant execute on function public.mark_pending_delegated_contact_blocked_unauthorized to service_role;
revoke execute on function public.mark_pending_delegated_contact_blocked_unauthorized from anon, authenticated;

-- ============================================================
-- 6. cancel_pending_delegated_contact — correção incremental
--    (create or replace, mesmo padrão já usado pela 0110/0114): o
--    novo status pending_authorization também é um estado não-terminal
--    cancelável pela profissional — sem este ajuste, "cancela" durante
--    a pergunta de autorização silenciosamente não fazia nada (o
--    WHERE original de 0104 nunca incluía esse status, que não existia
--    até esta migration).
-- ============================================================
create or replace function public.cancel_pending_delegated_contact(
  p_id uuid,
  p_decision_message_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.pending_delegated_contacts
  set status = 'cancelled', decision_message_id = p_decision_message_id, resolved_at = now()
  where id = p_id
    and status in ('pending_number', 'pending_authorization', 'pending_approval');

  return found;
end;
$$;
