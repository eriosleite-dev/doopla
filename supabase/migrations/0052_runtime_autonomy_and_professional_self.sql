-- Doopla Intelligence Core v1 — fechamento do Runtime: autonomia de
-- envio seguro + professional_self. Autorizado explicitamente pelo
-- usuário após auditoria (ver relatório da conversa) — nenhuma
-- integração de canal real (WhatsApp/Meta/Resend) nesta migration.
--
-- Três peças:
--   1. Relaxa a constraint física que forçava
--      orchestrator_runs.requires_professional_review_before_send=true
--      incondicionalmente (migration 0044) — a própria migration
--      original já previa esse relaxamento "quando o Approval Engine
--      existir"; agora também existe o Post-model Policy Gate (Bloco
--      6), que continua sendo o enforcement final de CONTEÚDO,
--      independente deste campo.
--   2. Gap encontrado durante a implementação (fora do escopo
--      originalmente auditado dos 9 RPCs de 0051): start_orchestrator_run/
--      finish_orchestrator_run (Bloco 1, migration 0042) nunca tinham
--      sido estendidos com is_system_caller() — bloqueavam
--      incondicionalmente qualquer caller sem auth.uid() E recusavam
--      actor_type='system' explicitamente. Sem isso, NENHUM ciclo do
--      Runtime conseguiria sequer abrir/fechar um orchestrator_run.
--      Mesmo padrão já auditado e aprovado das 9 functions de 0051:
--      condição ADICIONAL a auth.uid(), nunca substituindo; ownership
--      estrutural (conversation_id -> represented_professional_id)
--      nunca pulado.
--   3. persist_ai_message — nova RPC pro caminho professional_self /
--      consult_professional-endereçado-ao-profissional: persiste a
--      resposta da própria Doopla (author_type='ai') direto em
--      conversation_messages, nunca via outbound_intents (que é só
--      pra canal externo real, com provider). Mesmo padrão de
--      persist_inbound_message (0051): sem p_run_id/p_trigger_message_id
--      porque conversation_messages não tem essas colunas (correlação
--      continua no nível de orchestrator_runs, igual toda mensagem
--      inbound já funciona hoje).

-- ============================================================
-- 1. Relaxa a constraint física de requires_professional_review_before_send.
-- ============================================================
alter table public.orchestrator_runs
  drop constraint orchestrator_runs_requires_professional_review_before_sen_check;

comment on column public.orchestrator_runs.requires_professional_review_before_send is 'Bloco 4 — derivado de resolveRequiresProfessionalReviewBeforeSend(responsePlan final), nunca do model. true para consult_professional/answer_with_known_information (compromisso ou dado potencialmente sensível); false para acknowledge/ask_external_participant/clarify_ambiguity/no_response_needed (nunca afirmam compromisso, por definição de prompt.ts). Relaxado nesta migration (0052) — a constraint física "= true" desta migration 0044 original já previa isso "quando o Approval Engine existir" (existe desde o Bloco 5); o Post-model Policy Gate (Bloco 6) continua sendo o enforcement final de CONTEÚDO, independente deste campo.';

-- ============================================================
-- 2a. start_orchestrator_run — estendido com is_system_caller().
--     Mesma assinatura, só a lógica interna muda.
-- ============================================================
create or replace function public.start_orchestrator_run(
  p_conversation_id uuid,
  p_represented_professional_id uuid,
  p_actor_type text,
  p_actor_profile_id uuid,
  p_external_participant_id uuid,
  p_trigger_source text,
  p_eligible_tools text[] default '{}'
)
returns public.orchestrator_runs
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.orchestrator_runs;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_is_system then
    -- Caminho de sistema: só actor_type='system', nunca representa um
    -- profissional específico como actor (previne um caller de
    -- sistema atribuir o run a um humano arbitrário via parâmetro).
    if p_actor_type <> 'system' then
      raise exception 'actor_type_not_supported' using errcode = '42501';
    end if;
    if p_actor_profile_id is not null then
      raise exception 'actor_profile_id_must_be_null_for_system' using errcode = '42501';
    end if;
  else
    -- v1: único caminho autenticado real é 'professional', e só
    -- quando o autenticado é ele mesmo o representado (mesma regra de
    -- resolveActorContext() no código — reafirmada aqui porque o
    -- banco nunca confia numa checagem já feita em outra camada).
    if p_actor_type <> 'professional' then
      raise exception 'actor_type_not_supported' using errcode = '42501';
    end if;
    if auth.uid() is distinct from p_actor_profile_id or auth.uid() is distinct from p_represented_professional_id then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  -- Ownership estrutural NUNCA pulado, sistema ou não: p_represented_professional_id
  -- só é aceito se bater com o dono real da conversation.
  if not exists (
    select 1 from public.conversations
    where id = p_conversation_id and represented_professional_id = p_represented_professional_id
  ) then
    raise exception 'conversation_not_owned' using errcode = '42501';
  end if;

  insert into public.orchestrator_runs (
    conversation_id, represented_professional_id, actor_type, actor_profile_id,
    external_participant_id, trigger_source, status, eligible_tools
  ) values (
    p_conversation_id, p_represented_professional_id, p_actor_type, p_actor_profile_id,
    p_external_participant_id, p_trigger_source, 'running', p_eligible_tools
  )
  returning * into v_run;

  return v_run;
end;
$$;

comment on function public.start_orchestrator_run is 'Único caminho de criação de um orchestrator_run. actor_type aceita professional (auth.uid() precisa ser o próprio represented/actor) ou system (Orchestrator/Runtime, is_system_caller(), nunca com actor_profile_id preenchido). Ownership de conversation_id/represented_professional_id sempre revalidado estruturalmente, nos dois caminhos.';

grant execute on function public.start_orchestrator_run to service_role;

-- ============================================================
-- 2b. finish_orchestrator_run — estendido com is_system_caller() +
--     novo parâmetro p_requires_professional_review_before_send
--     (deixou de ser hardcoded true na coluna). Adiciona parâmetro
--     novo -> precisa de drop+create (mesmo motivo já documentado na
--     0044 quando ela fez o mesmo pra adicionar os campos do Bloco 4).
-- ============================================================
drop function public.finish_orchestrator_run(uuid, text, text[], text, boolean, text, text[], text[], text, text, text, text, text, text, boolean, text[], text, integer, integer);

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
  p_evidence_used_count integer default 0,
  p_requires_professional_review_before_send boolean default true
)
returns public.orchestrator_runs
language plpgsql
security definer set search_path = public
as $$
declare
  v_run public.orchestrator_runs;
  v_is_system boolean;
begin
  v_is_system := public.is_system_caller();
  if not v_is_system and auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_status not in ('completed', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_run from public.orchestrator_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;

  if v_is_system then
    -- Sistema só fecha runs que ELE MESMO abriu como sistema — nunca
    -- um run aberto por uma sessão autenticada comum (ownership
    -- estrutural via a própria linha, nunca um parâmetro solto).
    if v_run.actor_type <> 'system' then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  else
    if auth.uid() is distinct from v_run.actor_profile_id then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
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
      missing_information_count = p_missing_information_count,
      evidence_used_count = p_evidence_used_count,
      requires_professional_review_before_send = p_requires_professional_review_before_send
  where id = p_run_id
  returning * into v_run;

  return v_run;
end;
$$;

comment on function public.finish_orchestrator_run is 'Único caminho de fechamento de um orchestrator_run. Caminho professional: só quem abriu o run (mesmo actor_profile_id) pode fechá-lo. Caminho system (is_system_caller()): só fecha runs que o próprio sistema abriu (actor_type=''system'' na linha, nunca um run de sessão comum). requires_professional_review_before_send agora é parâmetro real (default true, conservador) — deixou de ser hardcoded pela coluna (ver comentário da coluna, 0052).';

revoke all on function public.finish_orchestrator_run from public;
grant execute on function public.finish_orchestrator_run to authenticated, service_role;
revoke execute on function public.finish_orchestrator_run from anon;

-- ============================================================
-- 3. persist_ai_message — caminho de escrita da resposta da própria
--    Doopla endereçada ao PROFISSIONAL (professional_self, ou
--    consult_professional dentro de external_inquiry) — nunca pro
--    cliente (isso é outbound_intents, canal real com provider).
-- ============================================================
create function public.persist_ai_message(
  p_conversation_id uuid,
  p_content_type text,
  p_body text
)
returns public.conversation_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_message public.conversation_messages;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  insert into public.conversation_messages (
    conversation_id, direction, author_type, channel, content_type, body, generated_by
  ) values (
    p_conversation_id, 'outbound', 'ai', v_conv.channel, p_content_type, p_body, 'ai'
  )
  returning * into v_message;

  return v_message;
end;
$$;

comment on function public.persist_ai_message is 'Orchestrator/Runtime — único caminho de escrita da resposta da própria Doopla ENDEREÇADA AO PROFISSIONAL (professional_self, ou consult_professional dentro de uma conversa external_inquiry — prompt.ts já documenta que o draft pode ser dirigido ao profissional nesse plano). Nunca usado pra cliente externo (isso é outbound_intents, que tem provider/delivery state real). Só persiste conteúdo — não concede autoridade, não executa tool, não cria approval, não é um segundo caminho de policy (o Post-model Policy Gate já decidiu allowed antes desta chamada). last_activity_at é atualizado pelo trigger bump_conversation_last_activity_trigger (0040), nunca duplicado aqui.';

revoke all on function public.persist_ai_message from public;
grant execute on function public.persist_ai_message to service_role;
revoke execute on function public.persist_ai_message from anon, authenticated;
