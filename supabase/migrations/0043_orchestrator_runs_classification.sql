-- Doopla Intelligence Core v1 — Bloco 3: metadados de classificação
-- (Intent Classifier + Competence Router) aditivos em
-- orchestrator_runs.
--
-- A classificação pertence ao run que a produziu — não cria uma
-- tabela isolada pra evitar fragmentar observability sem necessidade
-- real (mesmo raciocínio da 0042 sobre não inchar ai_usage_events com
-- o que não é dela).
--
-- Nunca guarda conteúdo bruto de mensagem nem chain of thought — só
-- os campos estruturados da classificação já resolvidos em código
-- (relevantCompetencies/effectiveConfidence nunca vêm direto do
-- model). primary_intent/secondary_intents ficam como text/text[]
-- livre, SEM check constraint, de propósito: a taxonomia de Intent é
-- pequena e extensível por design (ver
-- src/lib/intelligence/classification/intents.ts) — travar isso no
-- banco obrigaria uma migration a cada ajuste de taxonomia, e o
-- vocabulário já é validado em código (zod) antes de qualquer
-- chamada a esta function. model_confidence/effective_confidence/
-- context_completeness/classification_status são vocabulário
-- arquitetural estável — esses sim ganham check constraint.

alter table public.orchestrator_runs
  add column primary_intent text,
  add column secondary_intents text[] not null default '{}',
  add column competencies text[] not null default '{}',
  add column model_confidence text check (model_confidence in ('high', 'medium', 'low')),
  add column effective_confidence text check (effective_confidence in ('high', 'medium', 'low')),
  add column context_completeness text check (context_completeness in ('complete', 'partial_missing', 'partial_unavailable')),
  add column classification_status text check (classification_status in ('classified', 'ambiguous', 'invalid'));

comment on column public.orchestrator_runs.primary_intent is 'Intent primária classificada nesta rodada (Bloco 3) — vocabulário controlado em código (src/lib/intelligence/classification/intents.ts), não travado no banco de propósito (taxonomia extensível).';
comment on column public.orchestrator_runs.secondary_intents is 'Intents secundárias/leituras plausíveis reportadas pelo model quando a classificação é ambígua.';
comment on column public.orchestrator_runs.competencies is 'Competências roteadas deterministicamente pelo CompetenceRouter a partir do(s) intent(s) — nunca escolhidas pelo model.';
comment on column public.orchestrator_runs.model_confidence is 'Autoavaliação de confiança do model, nunca ajustada — ver effective_confidence pra o valor autoritativo.';
comment on column public.orchestrator_runs.effective_confidence is 'Confiança autoritativa consumida pelo sistema — só pode ser igual ou mais baixa que model_confidence, nunca mais alta.';
comment on column public.orchestrator_runs.context_completeness is 'complete | partial_missing | partial_unavailable — calculado em código a partir de quais fontes o intent classificado depende (nunca contagem genérica de seções).';
comment on column public.orchestrator_runs.classification_status is 'classified | ambiguous (reportados pelo model) | invalid (só decidido em código, quando a saída do model nunca chega a validar de verdade — nunca confundido com um "outro" legítimo).';

-- finish_orchestrator_run() precisa de drop+create (não CREATE OR
-- REPLACE): os novos parâmetros mudam a assinatura, mesma situação já
-- documentada na migration 0042 pro log_ai_usage_event.
drop function public.finish_orchestrator_run(uuid, text, text[], text, boolean);

create function public.finish_orchestrator_run(
  p_run_id uuid,
  p_status text,
  p_called_tools text[] default '{}',
  p_error text default null,
  p_fallback_used boolean default false,
  p_primary_intent text default null,
  p_secondary_intents text[] default '{}',
  p_competencies text[] default '{}',
  p_model_confidence text default null,
  p_effective_confidence text default null,
  p_context_completeness text default null,
  p_classification_status text default null
)
returns public.orchestrator_runs
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.orchestrator_runs;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_status not in ('completed', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_run from public.orchestrator_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  if auth.uid() is distinct from v_run.actor_profile_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.orchestrator_runs
  set status = p_status,
      called_tools = p_called_tools,
      error = p_error,
      fallback_used = p_fallback_used,
      finished_at = now(),
      latency_ms = extract(epoch from (now() - started_at)) * 1000,
      primary_intent = p_primary_intent,
      secondary_intents = p_secondary_intents,
      competencies = p_competencies,
      model_confidence = p_model_confidence,
      effective_confidence = p_effective_confidence,
      context_completeness = p_context_completeness,
      classification_status = p_classification_status
  where id = p_run_id
  returning * into v_run;

  return v_run;
end;
$$;

comment on function public.finish_orchestrator_run is 'Único caminho de fechamento de um orchestrator_run. Só quem abriu o run (mesmo actor_profile_id) pode fechá-lo. Parâmetros de classificação (Bloco 3) são opcionais/nulos pra runs que não classificam nada.';

revoke all on function public.finish_orchestrator_run from public;
grant execute on function public.finish_orchestrator_run to authenticated;
revoke execute on function public.finish_orchestrator_run from anon;
