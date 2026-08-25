-- Doopla Intelligence Core v1 — Bloco 4: metadados do Response
-- Planner (Structured Decision, dry-run) aditivos em
-- orchestrator_runs.
--
-- Mesmo raciocínio da 0043: pertence ao run que produziu, não cria
-- tabela isolada. Nunca guarda conteúdo — nem proposed_response, nem
-- missing_information/evidence_used em detalhe, só contagens. Isso
-- não é uma omissão: proposed_response é texto derivado de dados
-- reais do cliente/profissional, e missing_information/evidence_used
-- carregam rótulos livres — nenhum dos três é "metadado de execução"
-- no mesmo sentido que primary_intent/response_plan são.
--
-- response_plan e professional_decision_signal ganham CHECK — são
-- vocabulário arquitetural central deste bloco, não uma taxonomia
-- extensível como intent. professional_decision_category fica sem
-- CHECK, mesmo raciocínio de competencies/secondary_intents na 0043:
-- array de vocabulário controlado em código, plausivelmente
-- extensível, validado em zod antes de qualquer chamada aqui.
--
-- requires_professional_review_before_send É a invariante central do
-- Bloco 4: sempre true nesta etapa (Planner nunca produz permissão de
-- envio) — reforçada em três camadas independentes: tipo literal
-- `true` em TypeScript, fora do schema que o model preenche, e aqui,
-- um CHECK que impede fisicamente qualquer outro valor até uma
-- migration futura relaxar isso explicitamente quando o Approval
-- Engine existir.

alter table public.orchestrator_runs
  add column response_plan text check (response_plan in (
    'answer_with_known_information', 'acknowledge', 'ask_external_participant', 'consult_professional',
    'wait_for_external_participant', 'wait_for_professional', 'clarify_ambiguity', 'no_response_needed'
  )),
  add column commitment_nature text check (commitment_nature in ('report_existing_fact', 'new_or_changed_commitment', 'not_applicable')),
  add column requires_professional_decision boolean,
  add column professional_decision_category text[] not null default '{}',
  add column professional_decision_signal text check (professional_decision_signal in ('none', 'candidate_contextual', 'candidate_ambiguous')),
  add column requires_professional_review_before_send boolean not null default true check (requires_professional_review_before_send = true),
  add column missing_information_count integer not null default 0 check (missing_information_count >= 0),
  add column evidence_used_count integer not null default 0 check (evidence_used_count >= 0);

comment on column public.orchestrator_runs.response_plan is 'Bloco 4 — próximo passo planejado, nunca uma ação realizada. wait_for_* ficam no vocabulário pra contrato futuro, mas o Planner v1 nunca os produz (exigem Pending Work, que ainda não existe).';
comment on column public.orchestrator_runs.commitment_nature is 'report_existing_fact (relato de algo já resolvido) | new_or_changed_commitment (tentativa de criar/mudar compromisso) | not_applicable — INTENT ≠ DECISION: o mesmo intent pode cair em qualquer um destes conforme o conteúdo concreto do turno.';
comment on column public.orchestrator_runs.requires_professional_decision is 'true só quando commitment_nature=new_or_changed_commitment produziu ao menos uma professional_decision_category — nunca inferido do intent sozinho.';
comment on column public.orchestrator_runs.professional_decision_category is 'União de categorias mandatórias (INTENT_MANDATORY_DECISION_CATEGORIES, só quando commitment_nature=new_or_changed_commitment) com o que o model propôs e o código validou — nunca escolhido livremente pelo model, nunca com uma categoria mandatória removida.';
comment on column public.orchestrator_runs.professional_decision_signal is 'Sinal NÃO-autoritativo sobre uma possível decisão do profissional — candidate_contextual NUNCA significa aprovação. Só o Approval Engine futuro valida proposta/versão/escopo/autoridade de verdade.';
comment on column public.orchestrator_runs.requires_professional_review_before_send is 'Invariante deste bloco: sempre true. Nenhuma saída do Planner pode ser marcada como autorizada pra envio.';
comment on column public.orchestrator_runs.missing_information_count is 'Só a contagem — os rótulos de campo específicos nunca são persistidos aqui (poderiam carregar contexto de negócio, ver comentário do topo).';
comment on column public.orchestrator_runs.evidence_used_count is 'Só a contagem — as referências de proveniência específicas nunca são persistidas aqui.';

-- finish_orchestrator_run() precisa de drop+create de novo (mesma
-- situação da 0043): novos parâmetros mudam a assinatura.
drop function public.finish_orchestrator_run(uuid, text, text[], text, boolean, text, text[], text[], text, text, text, text);

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
  p_classification_status text default null,
  p_response_plan text default null,
  p_commitment_nature text default null,
  p_requires_professional_decision boolean default null,
  p_professional_decision_category text[] default '{}',
  p_professional_decision_signal text default null,
  p_missing_information_count integer default 0,
  p_evidence_used_count integer default 0
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
      classification_status = p_classification_status,
      response_plan = p_response_plan,
      commitment_nature = p_commitment_nature,
      requires_professional_decision = p_requires_professional_decision,
      professional_decision_category = p_professional_decision_category,
      professional_decision_signal = p_professional_decision_signal,
      -- requires_professional_review_before_send NUNCA é parâmetro
      -- desta function — fica no default true da coluna, sempre.
      missing_information_count = p_missing_information_count,
      evidence_used_count = p_evidence_used_count
  where id = p_run_id
  returning * into v_run;

  return v_run;
end;
$$;

comment on function public.finish_orchestrator_run is 'Único caminho de fechamento de um orchestrator_run. Só quem abriu o run (mesmo actor_profile_id) pode fechá-lo. Parâmetros de classificação (Bloco 3) e planejamento (Bloco 4) são opcionais/nulos pra runs que não os produzem. requires_professional_review_before_send nunca é parâmetro — é sempre true, por invariante de coluna.';

revoke all on function public.finish_orchestrator_run from public;
grant execute on function public.finish_orchestrator_run to authenticated;
revoke execute on function public.finish_orchestrator_run from anon;
