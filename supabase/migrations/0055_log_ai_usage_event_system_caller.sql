-- Doopla Intelligence Core v1 — micro-patch isolado, autorizado após a
-- auditoria mecânica de contratos TS -> Postgres (achado: log_ai_usage_event
-- nunca foi estendida com is_system_caller(), migration 0051 — ela
-- lista explicitamente as 8 RPCs que ganharam esse boundary e esta não
-- é uma delas). Reproduzido contra Postgres real: qualquer chamada
-- como service_role levanta not_authorized (auth.uid() é sempre null
-- nesse caminho), incondicionalmente, desde a criação da function
-- (0041/0042) — bem antes de is_system_caller() existir.
--
-- Efeito em produção: pipeline.ts e resumption.ts chamam esta RPC sem
-- checar {error} — o INSERT em ai_usage_events nunca acontece pra
-- nenhuma execução automatizada do Runtime, e ninguém percebe (a
-- exceção é descartada silenciosamente, o ciclo continua normal).
-- Perda de telemetria de custo/uso, não um bloqueio funcional.
--
-- Correção de contrato, não remoção de checagem: authenticated
-- continua exatamente como era (profile_id = auth.uid(), nunca um
-- parâmetro, conversation/run precisam pertencer a quem chama). Pro
-- caminho de sistema, exige p_professional_id explícito (mesmo padrão
-- de is_commercial_root_terminal, migration 0051) — nunca aceita a
-- identidade solta: quando p_conversation_id/p_run_id também são
-- informados, ainda precisam pertencer a ESSE p_professional_id
-- (mesma checagem conversation_not_owned/run_not_owned de sempre, só
-- comparada contra a identidade resolvida, nunca mais hardcoded em
-- auth.uid()) — um system caller não pode gravar telemetria em nome
-- de um profissional arbitrário citando conversation_id/run_id de
-- outro.
--
-- drop explícito da assinatura antiga (7 args) antes do create: como
-- o parâmetro novo entra no fim da lista, `create or replace` sozinho
-- criaria um SEGUNDO overload em vez de substituir (Postgres
-- distingue functions pela lista de tipos de argumento, não só pelo
-- nome) — mesmo achado/mesma correção já aplicada a
-- is_commercial_root_terminal na migration 0051.
drop function if exists public.log_ai_usage_event(text, text, text, uuid, integer, integer, uuid);

create or replace function public.log_ai_usage_event(
  p_feature text,
  p_model text,
  p_status text,
  p_conversation_id uuid default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_run_id uuid default null,
  p_professional_id uuid default null
)
returns public.ai_usage_events
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.ai_usage_events;
  v_is_system boolean;
  v_professional_id uuid;
begin
  v_is_system := public.is_system_caller();
  if v_is_system then
    if p_professional_id is null then
      raise exception 'professional_id_required_for_system_caller' using errcode = '22023';
    end if;
    v_professional_id := p_professional_id;
  else
    if auth.uid() is null then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    -- p_professional_id é sempre ignorado no caminho authenticated —
    -- nunca uma segunda fonte de identidade, auth.uid() continua a
    -- única prova pra quem tem sessão real (mesmo caso um caller mal
    -- intencionado tente passar o id de outro profissional aqui).
    v_professional_id := auth.uid();
  end if;

  if p_conversation_id is not null then
    if not exists (
      select 1 from public.conversations
      where id = p_conversation_id and represented_professional_id = v_professional_id
    ) then
      raise exception 'conversation_not_owned' using errcode = '42501';
    end if;
  end if;

  if p_run_id is not null then
    if not exists (
      select 1 from public.orchestrator_runs
      where id = p_run_id and represented_professional_id = v_professional_id
    ) then
      raise exception 'run_not_owned' using errcode = '42501';
    end if;
  end if;

  insert into public.ai_usage_events (
    profile_id, conversation_id, feature, model, status, input_tokens, output_tokens, run_id
  ) values (
    v_professional_id, p_conversation_id, p_feature, p_model, p_status, p_input_tokens, p_output_tokens, p_run_id
  )
  returning * into v_event;

  return v_event;
end;
$$;

comment on function public.log_ai_usage_event is 'Único caminho de INSERT em ai_usage_events. Caminho authenticated inalterado: profile_id é sempre auth.uid(), nunca um parâmetro (p_professional_id é ignorado). Caminho is_system_caller() (service_role/Runtime, estendido nesta migration): exige p_professional_id explícito, fail-closed sem ele (professional_id_required_for_system_caller) — nunca assume. Nos dois caminhos, conversation_id/run_id, quando informados, precisam pertencer à identidade resolvida (nunca confia que o chamador já validou isso) — um system caller não grava telemetria em nome de um profissional arbitrário citando conversation/run de outro.';

revoke all on function public.log_ai_usage_event from public;
grant execute on function public.log_ai_usage_event to authenticated, service_role;
revoke execute on function public.log_ai_usage_event from anon;
