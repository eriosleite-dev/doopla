-- Task #76 (4.2/ADR 0012) — coluna subject_key em professional_memories:
-- escopo livre curto (ex. "bar", "casamento") a que uma preferência se
-- aplica; null = regra geral, sem escopo específico. Mesmo princípio
-- de subjectKey já validado em policy-gate-post (ex.: logistics_commitment
-- "transport" vs "lodging") — aqui o espaço de contextos é aberto, não
-- uma taxonomia fechada, porque "tipo de evento/local/cliente" varia
-- demais entre profissionais pra caber numa lista fixa.
--
-- Nullable, sem default forçado além de null — memórias já existentes
-- (nenhuma em produção ainda, esta tabela nasceu na migration 0119 e
-- segue sem wiring real até a task #72) ficam subject_key=null, que é
-- a leitura correta: "regra geral" é o estado neutro, nunca "escopo
-- desconhecido" tratado como coincidência de escopo com outra memória
-- (resolveMemorySupersessionCandidate, memory-policy.ts, já testada,
-- compara null só com null — nunca com um valor concreto).
alter table public.professional_memories
  add column subject_key text;

comment on column public.professional_memories.subject_key is 'Task #76 (ADR 0012) — escopo livre curto (ex. "bar", "casamento"), nunca taxonomia fechada. null = regra geral, sem escopo. Decidido pelo model em recognizePreferenceDeclaration (preference-recognizer.ts), nunca por este schema.';

-- propose_professional_memory precisa aceitar o novo campo pra
-- persistir o que o recognizer já propõe (preference-recognizer.ts,
-- commit anterior) — CREATE OR REPLACE com o novo parâmetro no FINAL
-- da lista e default null, nunca reordena os parâmetros existentes
-- (manteria compatibilidade com qualquer chamada antiga, embora nesta
-- v1 o único caller seja persistProposedMemory, já atualizado junto).
create or replace function public.propose_professional_memory(
  p_id uuid,
  p_professional_id uuid,
  p_kind text,
  p_value text,
  p_evidence jsonb,
  p_confidence numeric,
  p_created_at timestamptz,
  p_expires_at timestamptz default null,
  p_subject_key text default null
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
    id, professional_id, kind, value, evidence, confidence, status, created_at, expires_at, subject_key
  )
  values (
    p_id, p_professional_id, p_kind, p_value, p_evidence, p_confidence, 'proposed', p_created_at, p_expires_at, p_subject_key
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.propose_professional_memory is 'Único jeito de uma professional_memories nascer. Persiste exatamente o objeto já validado/construído por proposeMemory (memory-policy.ts, TS) — nenhuma validação de negócio reimplementada aqui além dos checks de coluna (defesa em profundidade). Sempre status=proposed. subject_key (task #76) opcional, default null.';

revoke all on function public.propose_professional_memory from public;
grant execute on function public.propose_professional_memory to service_role;
revoke execute on function public.propose_professional_memory from anon, authenticated;
