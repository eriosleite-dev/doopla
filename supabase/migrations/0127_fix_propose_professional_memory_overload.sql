-- Correção da migration 0126: "create or replace function" com uma
-- lista de parâmetros DIFERENTE da original não substitui a function
-- em Postgres — cria uma SEGUNDA versão sobrecarregada (overload),
-- porque a identidade de uma function inclui seus tipos de parâmetro.
-- Isso deixou duas propose_professional_memory coexistindo, e
-- qualquer referência por nome sem a lista de parâmetros (comment on,
-- revoke, chamadas RPC do supabase-js) passou a ser ambígua.
--
-- Idempotente de propósito (if exists/if not exists em tudo): não sei
-- com certeza até onde a 0126 chegou antes de falhar, então esta
-- migration precisa funcionar igual nos dois cenários (0126 rodou só
-- o ALTER TABLE, ou já criou a function nova também).

alter table public.professional_memories
  add column if not exists subject_key text;

-- Remove as duas assinaturas possíveis, explicitamente por tipo de
-- parâmetro (nunca por nome sozinho — é exatamente isso que causou o
-- erro) — garante estado limpo antes de recriar.
drop function if exists public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz);
drop function if exists public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz, text);

create function public.propose_professional_memory(
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

comment on function public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz, text) is 'Único jeito de uma professional_memories nascer. Persiste exatamente o objeto já validado/construído por proposeMemory (memory-policy.ts, TS) — nenhuma validação de negócio reimplementada aqui além dos checks de coluna (defesa em profundidade). Sempre status=proposed. subject_key (task #76) opcional, default null.';

revoke all on function public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz, text) from public;
grant execute on function public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz, text) to service_role;
revoke execute on function public.propose_professional_memory(uuid, uuid, text, text, jsonb, numeric, timestamptz, timestamptz, text) from anon, authenticated;

comment on column public.professional_memories.subject_key is 'Task #76 (ADR 0012) — escopo livre curto (ex. "bar", "casamento"), nunca taxonomia fechada. null = regra geral, sem escopo. Decidido pelo model em recognizePreferenceDeclaration (preference-recognizer.ts), nunca por este schema.';
