-- Doopla Intelligence Core v1 — ADR 0004, Rodada 4/5 (15/10/2026):
-- fundação de persistência pra learning/memory-policy.ts (memória de
-- preferências profissionais, Nível 1 — communication_style/
-- operational_preference/commercial_preference/client_context).
--
-- Espelha ProfessionalMemory (memory-policy.ts) 1:1, exatamente como
-- especificado na Rodada 4 seção 2.4 item 3 do ADR 0004. Esta migration
-- é SÓ a camada de persistência — toda a lógica de decisão (validação
-- de input, regra de quem pode revisar, transição de estado) já vive
-- e já é testada em memory-policy.ts (puro, zero I/O). As functions
-- abaixo nunca reimplementam essa lógica: só persistem o objeto que a
-- function pura já validou/construiu, com uma guarda atômica extra de
-- estado (UPDATE ... WHERE status = <esperado>) pra nunca permitir duas
-- transições concorrentes da mesma proposta — mesmo rigor de claim já
-- usado no resto do projeto (pending_delegated_contacts etc.).
--
-- Fora de escopo desta migration, por instrução explícita da fundadora
-- ("não quero novas alterações no Planner antes de avaliarmos as
-- respostas produzidas pelo modelo"): nenhum wiring em
-- Context Builder/planner/prompt.ts, nenhum recognizer novo, nenhum
-- cron. Isso é fundação pura, testada localmente, nunca aplicada em
-- staging/produção sem aprovação específica (mesmo processo de sempre).
--
-- "Nível 2" (commercial_restriction, ADR 0004 Rodada 5 seção 5.2) fica
-- DELIBERADAMENTE fora desta migration — foi reclassificado como regra
-- aplicada em código pelo Post-model Policy Gate (planner/invariants.ts),
-- nunca uma linha nesta tabela: implementação própria, quando aprovada.

create table public.professional_memories (
  id uuid primary key,
  professional_id uuid not null references public.profiles (id) on delete cascade,

  kind text not null check (kind in ('communication_style', 'operational_preference', 'commercial_preference', 'client_context')),

  -- Mesmo limite/mesma recusa (nunca truncamento) já validados por
  -- proposeMemory (memory-policy.ts) antes de chegar aqui — o check
  -- abaixo é defesa em profundidade, nunca a primeira linha de validação.
  value text not null check (char_length(value) > 0 and char_length(value) <= 500),

  -- {"sourceType": "...", "sourceId": "..."} — nunca o texto bruto da
  -- evidência duplicado aqui (mesmo princípio de MemoryEvidence:
  -- auditável de volta pela fonte real, nunca um texto solto).
  evidence jsonb not null check (evidence ? 'sourceType' and evidence ? 'sourceId'),

  -- Autoavaliação de confiança do model, NUNCA autorização — reforçado
  -- estruturalmente por este ser só contexto (ver comentário da tabela).
  confidence numeric(3, 2) not null check (confidence >= 0 and confidence <= 1),

  -- 'approved' é o único status que selectContextMemories (TS, já
  -- testado) considera elegível pro contexto do Planner — nunca lido
  -- diretamente por nenhum gate de decisão comercial.
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'revoked')),

  created_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz
);

comment on table public.professional_memories is 'ADR 0004 Rodada 4/5 — persistência de ProfessionalMemory (memory-policy.ts, Nível 1: preferência/contexto em texto curto). MEMÓRIA NUNCA É AUTORIZAÇÃO COMERCIAL — nenhum gate de decisão lê esta tabela, só o Context Builder/Planner (wiring fora desta migration). "Nível 2" (restrição obrigatória) nunca entra aqui — vive em código (Post-model Policy Gate), implementação própria.';
comment on column public.professional_memories.evidence is 'MemoryEvidence (memory-policy.ts): {sourceType, sourceId}. Sempre rastreável até a origem real (mensagem/edição/booking) — nunca um texto solto sem proveniência.';

create index professional_memories_professional_idx on public.professional_memories (professional_id);
create index professional_memories_professional_status_idx on public.professional_memories (professional_id, status);

alter table public.professional_memories enable row level security;
-- Sem policy pra authenticated/anon — mesmo padrão de
-- professional_contact_memories/pending_delegated_contacts. Um painel
-- que precise listar isso um dia passa por uma function própria com
-- is_system_caller()/auth.uid() verificando o dono, nunca por policy
-- direta nesta tabela.

-- ============================================================
-- 1. propose_professional_memory — único jeito de uma
--    professional_memories nascer. SEMPRE status='proposed' (hardcoded,
--    nunca aceita o status como parâmetro) — espelha exatamente o
--    invariante já testado de proposeMemory (memory-policy.ts):
--    nenhuma fonte, nenhuma confiança, autoriza uma memória de origem.
-- ============================================================
create function public.propose_professional_memory(
  p_id uuid,
  p_professional_id uuid,
  p_kind text,
  p_value text,
  p_evidence jsonb,
  p_confidence numeric,
  p_created_at timestamptz,
  p_expires_at timestamptz default null
)
returns public.professional_memories
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_memories;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.professional_memories (
    id, professional_id, kind, value, evidence, confidence, status, created_at, expires_at
  )
  values (
    p_id, p_professional_id, p_kind, p_value, p_evidence, p_confidence, 'proposed', p_created_at, p_expires_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.propose_professional_memory is 'Único jeito de uma professional_memories nascer. Persiste exatamente o objeto já validado/construído por proposeMemory (memory-policy.ts, TS) — nenhuma validação de negócio reimplementada aqui além dos checks de coluna (defesa em profundidade). Sempre status=proposed.';

revoke all on function public.propose_professional_memory from public;
grant execute on function public.propose_professional_memory to service_role;
revoke execute on function public.propose_professional_memory from anon, authenticated;

-- ============================================================
-- 2. review_professional_memory — único jeito de mover
--    'proposed' -> 'approved'/'rejected'. Guarda atômica de estado
--    (WHERE status = 'proposed') nunca permite duas revisões
--    simultâneas da mesma proposta — mesma reivindicação da seção de
--    riscos residuais do topo de memory-policy.ts. reviewerId precisa
--    ser EXATAMENTE o professional_id dono (mesmo invariante de
--    reviewMemory, TS) — nunca o cliente que deu a evidência.
-- ============================================================
create function public.review_professional_memory(
  p_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_reviewed_at timestamptz
)
returns public.professional_memories
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_memories;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  update public.professional_memories
  set status = p_decision, reviewed_at = p_reviewed_at, reviewed_by = p_reviewer_id
  where id = p_id and professional_id = p_reviewer_id and status = 'proposed'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_proposed' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.review_professional_memory is 'Única transição proposed -> approved/rejected. Guarda atômica (WHERE status=proposed) nunca permite duas revisões concorrentes da mesma proposta. reviewerId precisa bater com professional_id dono (nunca o cliente que deu a evidência) — mesmo invariante de reviewMemory (memory-policy.ts).';

revoke all on function public.review_professional_memory from public;
grant execute on function public.review_professional_memory to service_role;
revoke execute on function public.review_professional_memory from anon, authenticated;

-- ============================================================
-- 3. revoke_professional_memory — único jeito de mover
--    'approved' -> 'revoked'. Nunca apaga fisicamente (diferente de
--    professional_contact_memories — aqui o dado é da PRÓPRIA
--    profissional, trilha de auditoria dela mesma é aceitável manter,
--    mesmo invariante de revokeMemory, TS).
-- ============================================================
create function public.revoke_professional_memory(
  p_id uuid,
  p_revoked_by uuid,
  p_revoked_at timestamptz
)
returns public.professional_memories
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.professional_memories;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.professional_memories
  set status = 'revoked', reviewed_at = p_revoked_at, reviewed_by = p_revoked_by
  where id = p_id and professional_id = p_revoked_by and status = 'approved'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found_not_owned_or_not_approved' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

comment on function public.revoke_professional_memory is 'Única transição approved -> revoked. Nunca apaga fisicamente (dado da própria profissional, trilha de auditoria aceitável) — mesmo invariante de revokeMemory (memory-policy.ts). Garante estruturalmente que selectContextMemories nunca mais devolve esta memória (só lê status=approved).';

revoke all on function public.revoke_professional_memory from public;
grant execute on function public.revoke_professional_memory to service_role;
revoke execute on function public.revoke_professional_memory from anon, authenticated;

-- ============================================================
-- 4. list_approved_professional_memories — único ponto de leitura
--    pro futuro Context Builder (wiring fora desta migration). Devolve
--    só status='approved' (proposed/rejected/revoked nunca precisam
--    chegar lá) — dedup por (kind, valor normalizado), filtro de
--    expiração e limite continuam só em selectContextMemories (TS, já
--    testado), nunca duplicados aqui.
-- ============================================================
create function public.list_approved_professional_memories(
  p_professional_id uuid
)
returns setof public.professional_memories
language sql
security definer set search_path = public
stable
as $$
  select *
  from public.professional_memories
  where professional_id = p_professional_id
    and status = 'approved'
  order by created_at desc;
$$;

comment on function public.list_approved_professional_memories is 'Leitura pro futuro selectContextMemories (memory-policy.ts, wiring fora desta migration) — só status=approved, isolado por professional_id. Dedup/expiração/limite continuam só na function pura TS, já testada, nunca duplicados em SQL.';

revoke all on function public.list_approved_professional_memories from public;
grant execute on function public.list_approved_professional_memories to service_role;
revoke execute on function public.list_approved_professional_memories from anon, authenticated;
