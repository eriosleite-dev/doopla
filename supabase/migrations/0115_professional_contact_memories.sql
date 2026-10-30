-- Doopla Intelligence Core v1 — ADR 0004, Rodada 2 (15/10/2026):
-- núcleo de memória de contatos — "Doopla, fala com a Marina" lembrar
-- o telefone dela entre pedidos, sem perguntar de novo.
--
-- Aprovado pela fundadora/Head of AI com 2 decisões e 3 condições
-- (ver ADR 0004, seção dedicada). Esta migration cobre só o NÚCLEO —
-- tabela + RPCs de memória e lookup. Nenhuma mudança no webhook,
-- nenhuma mudança em delegated-contact-flow.ts/pending_delegated_contacts
-- (essa parte é TS, muda em arquivo próprio, nunca aqui).
--
-- Decisão 1 (memória ativa): uma memória nasce 'active' direto, sem
-- segunda tela de aprovação, quando a evidência é o próprio
-- profissional compartilhando o contato em resposta ao próprio pedido
-- — autoria inequívoca, equivalente a qualquer outro dado que o
-- profissional fornece ativamente ao sistema.
--
-- Decisão 2 (exclusão física): delete_professional_contact_memory
-- abaixo é HARD DELETE de verdade — nunca um soft-revoke como
-- memory-policy.ts faz pra preferências da própria profissional. O
-- dado aqui é de um TERCEIRO que nunca autorizou a Doopla diretamente;
-- um pedido de exclusão remove a linha de fato. external_participant_id
-- usa `on delete set null` (nunca cascade) — apagar uma memória NUNCA
-- apaga a conversa/participante reais, se existirem; são entidades
-- independentes, a memória só aponta pra uma quando existe. Retenção
-- de backup/WAL do Postgres (fora do controle desta function) e a
-- política de retenção da Supabase ficam fora do alcance de um DELETE
-- de aplicação — documentado como limite real, nunca prometido como
-- "apagado de todo lugar" pela fundadora.
--
-- Condição 3 (consentimento de envio): DELIBERADAMENTE esta tabela não
-- tem nenhum campo `consent_status`/autorização de comunicação. A
-- fundadora pediu uma separação explícita entre "identidade conhecida"
-- (o que esta tabela modela) e "autorização para comunicação" (gate de
-- envio, já existente e intocado em checkRecipientConsent/
-- executeTemplateSend, delegated-contact-flow.ts) — misturar os dois
-- aqui criaria risco de alguém um dia ler um campo desta tabela como
-- se fosse permissão de envio. O ajuste mínimo pro rastro de
-- autorização fica registrado como proposta separada no ADR 0004
-- (auditoria + desenho, não implementado nesta migration).
--
-- Condição 5 (isolamento e reuso): escopada por professional_id, mesmo
-- padrão não-negociável de external_participants/pending_delegated_contacts.
-- Tabela PRÓPRIA, nunca um campo genérico dentro de memory-policy.ts —
-- aquele módulo continua só preferência em texto curto, nunca virou
-- depósito de telefone.

create table public.professional_contact_memories (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,

  -- Nome como o profissional se refere à pessoa ("Marina"). Nomes
  -- adicionais vistos pro MESMO telefone (ex.: "Marina Produtora")
  -- entram em `aliases`, nunca sobrescrevem este campo nem geram uma
  -- segunda linha — ver create_or_update_professional_contact_memory.
  canonical_name text not null,
  aliases text[] not null default '{}',

  -- Sempre normalizado via normalizeWhatsappPhone (TS) antes de
  -- chegar aqui — nunca um segundo normalizador em SQL. Dedup real
  -- do contato: um telefone só pode ter UMA linha por profissional
  -- (constraint abaixo); ver a função de upsert pra como um nome
  -- incompatível vira alias em vez de duplicar.
  phone_number text not null,

  company text,
  relationship_note text,

  -- Preenchido quando/se uma conversa real com esse telefone já existe
  -- (resolveOrCreateExternalParticipant, fora desta migration) — nunca
  -- duplica a verdade já modelada em external_participants, só aponta
  -- pra ela. `on delete set null`: apagar o participante real (fora de
  -- escopo normal) nunca apaga a memória por engano, só desvincula.
  external_participant_id uuid references public.external_participants (id) on delete set null,

  -- Proveniência — sempre rastreável até a origem real, nunca um texto
  -- solto. 'manual_text': a profissional digitou o número na própria
  -- mensagem. 'contact_card': veio de um cartão de contato do WhatsApp
  -- (canal ainda não implementado — ver ADR 0004, Condição 4; o campo
  -- já existe aqui pra não exigir uma segunda migration quando esse
  -- canal for implementado).
  source_type text not null check (source_type in ('contact_card', 'manual_text')),
  source_pending_delegated_contact_id uuid references public.pending_delegated_contacts (id) on delete set null,
  source_trigger_message_id uuid references public.conversation_messages (id) on delete set null,

  -- 'merged' reservado pra quando uma correção futura reconhecer que
  -- duas linhas (telefones diferentes) eram a mesma pessoa — não usado
  -- nesta rodada (nenhum código escreve 'merged' ainda). Nunca existe
  -- status 'deleted': uma exclusão real remove a linha (Decisão 2),
  -- nunca muda status.
  status text not null default 'active' check (status in ('active', 'merged')),
  merged_into_id uuid references public.professional_contact_memories (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (professional_id, phone_number)
);

comment on table public.professional_contact_memories is 'ADR 0004 Rodada 2 — memória de "quem é quem" por profissional (nome -> telefone), pra "fala com a Marina" não perguntar o contato de novo. NUNCA autorização de envio (ver checkRecipientConsent/executeTemplateSend, delegated-contact-flow.ts, intocados por esta tabela). Exclusão é sempre física (delete_professional_contact_memory), nunca soft-revoke.';
comment on column public.professional_contact_memories.aliases is 'Nomes adicionais vistos pro mesmo telefone — nunca uma segunda linha pro mesmo número. A ambiguidade real que o lookup trata é a direção OPOSTA: um nome batendo com 2+ telefones diferentes (2+ linhas), nunca um telefone com nomes múltiplos.';

create index professional_contact_memories_professional_idx on public.professional_contact_memories (professional_id);
create index professional_contact_memories_name_idx on public.professional_contact_memories (professional_id, lower(canonical_name));

create trigger set_updated_at before update on public.professional_contact_memories
  for each row execute function public.set_updated_at();

alter table public.professional_contact_memories enable row level security;
-- Sem policy pra authenticated/anon — mesmo padrão de pending_delegated_contacts/
-- runtime_pending_replies. Um painel que precise listar/editar memórias
-- um dia passa por uma function própria com is_system_caller()/auth.uid()
-- verificando o dono, nunca por policy direta nesta tabela.

-- ============================================================
-- 1. create_or_update_professional_contact_memory — único jeito de
--    uma memória nascer ou ganhar um alias novo. SEMPRE 'active' de
--    origem (Decisão 1 — autoria inequívoca da própria profissional).
--    Idempotente: reexecutar com o mesmo (professional_id, telefone)
--    nunca duplica, só acrescenta o nome como alias se for novo.
-- ============================================================
create function public.create_or_update_professional_contact_memory(
  p_professional_id uuid,
  p_canonical_name text,
  p_phone_number text,
  p_source_type text,
  p_source_pending_delegated_contact_id uuid default null,
  p_source_trigger_message_id uuid default null,
  p_company text default null,
  p_relationship_note text default null
)
returns public.professional_contact_memories
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.professional_contact_memories;
  v_row public.professional_contact_memories;
  v_name_norm text := lower(trim(p_canonical_name));
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_existing
  from public.professional_contact_memories
  where professional_id = p_professional_id and phone_number = p_phone_number and status = 'active'
  for update;

  if v_existing.id is null then
    insert into public.professional_contact_memories (
      professional_id, canonical_name, phone_number, company, relationship_note,
      source_type, source_pending_delegated_contact_id, source_trigger_message_id
    )
    values (
      p_professional_id, p_canonical_name, p_phone_number, p_company, p_relationship_note,
      p_source_type, p_source_pending_delegated_contact_id, p_source_trigger_message_id
    )
    returning * into v_row;
    return v_row;
  end if;

  update public.professional_contact_memories
  set
    aliases = case
      when lower(trim(canonical_name)) = v_name_norm then aliases
      when exists (select 1 from unnest(aliases) a where lower(trim(a)) = v_name_norm) then aliases
      else array_append(aliases, p_canonical_name)
    end,
    -- Nunca sobrescreve um fato humano já registrado — só preenche se
    -- ainda estava vazio, mesmo princípio de "nunca inventa/nunca
    -- perde dado já dado" do resto do projeto.
    company = coalesce(company, p_company),
    relationship_note = coalesce(relationship_note, p_relationship_note)
  where id = v_existing.id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_or_update_professional_contact_memory is 'Único jeito de uma professional_contact_memories nascer. Dedup real por (professional_id, phone_number) — telefone já conhecido nunca duplica linha, nome novo vira alias. Sempre status=active (Decisão 1, ADR 0004).';

revoke all on function public.create_or_update_professional_contact_memory from public;
grant execute on function public.create_or_update_professional_contact_memory to service_role;
revoke execute on function public.create_or_update_professional_contact_memory from anon, authenticated;

-- ============================================================
-- 2. find_professional_contact_memories_by_name — único ponto de
--    leitura pro lookup (delegated-contact-flow.ts, fora desta
--    migration). Sempre escopado por professional_id primeiro (nunca
--    confia que quem chama já filtrou) — isolamento de tenant
--    estrutural, mesmo padrão de selectContextMemories (memory-policy.ts).
-- ============================================================
create function public.find_professional_contact_memories_by_name(
  p_professional_id uuid,
  p_name text
)
returns setof public.professional_contact_memories
language sql
security definer set search_path = public
stable
as $$
  select *
  from public.professional_contact_memories
  where professional_id = p_professional_id
    and status = 'active'
    and (
      lower(trim(canonical_name)) = lower(trim(p_name))
      or exists (select 1 from unnest(aliases) a where lower(trim(a)) = lower(trim(p_name)))
    )
  order by created_at asc;
$$;

comment on function public.find_professional_contact_memories_by_name is 'Lookup por nome (canonical_name OU alias, case-insensitive) escopado por professional_id — 0 resultados: comportamento de hoje (pergunta o contato). 1: resolve sozinho. 2+: nunca escolhe, quem chama pergunta qual.';

revoke all on function public.find_professional_contact_memories_by_name from public;
grant execute on function public.find_professional_contact_memories_by_name to service_role;
revoke execute on function public.find_professional_contact_memories_by_name from anon, authenticated;

-- ============================================================
-- 3. correct_professional_contact_memory — única function de
--    correção explícita (Condição 1/produto: "a profissional sempre
--    pode corrigir"). Sempre exige o professional_id dono bater — uma
--    correção nunca atravessa tenant, mesmo que alguém tenha o id da
--    linha.
-- ============================================================
create function public.correct_professional_contact_memory(
  p_id uuid,
  p_professional_id uuid,
  p_canonical_name text default null,
  p_phone_number text default null,
  p_company text default null,
  p_relationship_note text default null
)
returns public.professional_contact_memories
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_contact_memories;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.professional_contact_memories
  set
    canonical_name = coalesce(p_canonical_name, canonical_name),
    phone_number = coalesce(p_phone_number, phone_number),
    company = coalesce(p_company, company),
    relationship_note = coalesce(p_relationship_note, relationship_note)
  where id = p_id and professional_id = p_professional_id and status = 'active'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_or_not_owned' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.correct_professional_contact_memory is 'Correção explícita (nome/telefone/empresa/relacionamento) — sempre exige professional_id dono, nunca atravessa tenant. Erro not_found_or_not_owned se o id não existir ou pertencer a outro profissional (nunca revela a diferença entre os dois casos).';

revoke all on function public.correct_professional_contact_memory from public;
grant execute on function public.correct_professional_contact_memory to service_role;
revoke execute on function public.correct_professional_contact_memory from anon, authenticated;

-- ============================================================
-- 4. delete_professional_contact_memory — HARD DELETE (Decisão 2).
--    Nunca soft-revoke: remove a linha de verdade. Sempre exige o
--    professional_id dono bater; id de outro profissional -> no-op
--    (devolve false), nunca erro que vaze se o id existe ou não.
-- ============================================================
create function public.delete_professional_contact_memory(
  p_id uuid,
  p_professional_id uuid
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.professional_contact_memories
  where id = p_id and professional_id = p_professional_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
end;
$$;

comment on function public.delete_professional_contact_memory is 'Exclusão FÍSICA real (Decisão 2, ADR 0004) — nunca status=revoked/deleted. external_participant_id (on delete set null na tabela) garante que apagar a memória nunca apaga a conversa/participante reais, se existirem. Retenção de backup/WAL do Postgres fica fora do alcance desta function — limite real, documentado no ADR, nunca prometido como "apagado de todo lugar".';

revoke all on function public.delete_professional_contact_memory from public;
grant execute on function public.delete_professional_contact_memory to service_role;
revoke execute on function public.delete_professional_contact_memory from anon, authenticated;
