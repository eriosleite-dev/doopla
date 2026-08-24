-- Doopla Intelligence Core v1 — Bloco 1: observabilidade mínima.
--
-- Uma execução do Core (run) precisa de um registro auditável próprio
-- — run_id, quem foi representado/ator, quais tools eram elegíveis,
-- quais foram chamadas, status, latência. ai_usage_events continua
-- focada em medir USO DE IA (tokens/custo por chamada ao provider) —
-- viraria uma tabela genérica demais se carregasse também estado de
-- execução do Orchestrator (elegibilidade de tools, actor_type,
-- fallback etc). Por isso: tabela nova, dedicada, e ai_usage_events
-- ganha só uma FK aditiva (run_id) pra linkar as duas quando uma
-- chamada à OpenAI acontecer dentro de um run.
--
-- Mesmo padrão de confiança de 0039/0040/0041: security definer,
-- nunca aceita identidade de parâmetro sem validar contra auth.uid(),
-- e — aprendendo do achado da 0041 — já revoga EXECUTE de `anon`
-- explicitamente nas duas functions novas, desde o início.

create table public.orchestrator_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  represented_professional_id uuid not null references public.profiles (id) on delete cascade,
  actor_type text not null check (actor_type in ('professional', 'authorized_collaborator', 'system')),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  external_participant_id uuid references public.external_participants (id) on delete set null,
  trigger_source text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  eligible_tools text[] not null default '{}',
  called_tools text[] not null default '{}',
  error text,
  fallback_used boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer,

  -- Nunca guarda chain of thought nem conteúdo de mensagem da
  -- conversa — só metadados de execução. Ver comentário de coluna
  -- abaixo.

  -- Isolamento de tenant garantido pelo banco: um run só pode
  -- referenciar uma conversa do MESMO profissional que ele representa
  -- (mesmo padrão de FK composta das migrations 0039).
  foreign key (conversation_id, represented_professional_id)
    references public.conversations (id, represented_professional_id)
);

comment on table public.orchestrator_runs is 'Um registro por execução do Intelligence Core (run_id). Só metadados de execução — nunca chain of thought, nunca conteúdo de conversation_messages duplicado aqui.';
comment on column public.orchestrator_runs.eligible_tools is 'Tools que o pre-model gate liberou pra este run, antes de qualquer chamada ao model.';
comment on column public.orchestrator_runs.called_tools is 'Tools de fato executadas durante o run — subconjunto de eligible_tools por construção (executeTool() recusa o que não está em eligible_tools).';
comment on column public.orchestrator_runs.error is 'Mensagem de erro/fallback técnica, nunca conteúdo de conversa nem chain of thought do model.';

create index orchestrator_runs_conversation_idx on public.orchestrator_runs (conversation_id, started_at desc);
create index orchestrator_runs_represented_professional_idx
  on public.orchestrator_runs (represented_professional_id, started_at desc);

alter table public.orchestrator_runs enable row level security;

-- Leitura: só o próprio representado lê os runs da própria conversa —
-- mesmo critério de posse usado em conversations/ai_usage_events.
create policy "orchestrator_runs: select own" on public.orchestrator_runs
  for select using (auth.uid() = represented_professional_id);

-- Nenhum INSERT/UPDATE direto de authenticated — só as duas functions
-- abaixo escrevem nesta tabela.
revoke insert, update, delete on public.orchestrator_runs from authenticated;

-- start_orchestrator_run(): único caminho de criação de um run. Valida
-- o ator internamente — nunca aceita actor_profile_id/represented_
-- professional_id como prova de identidade sozinha.
create function public.start_orchestrator_run(
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
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- v1: único actor_type com caminho autorizado é 'professional', e
  -- só quando o autenticado é ele mesmo o representado (mesma regra
  -- de resolveActorContext() no código — reafirmada aqui porque o
  -- banco nunca confia numa checagem já feita em outra camada).
  -- 'system'/'authorized_collaborator' ficam no check constraint da
  -- tabela (pro tipo já existir pro futuro), mas esta function recusa
  -- os dois — nenhum caminho real os aciona neste bloco.
  if p_actor_type <> 'professional' then
    raise exception 'actor_type_not_supported' using errcode = '42501';
  end if;

  if auth.uid() is distinct from p_actor_profile_id or auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

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

comment on function public.start_orchestrator_run is 'Único caminho de criação de um orchestrator_run. actor_type só aceita professional em v1; represented/actor precisam ser o próprio auth.uid().';

revoke all on function public.start_orchestrator_run from public;
grant execute on function public.start_orchestrator_run to authenticated;
revoke execute on function public.start_orchestrator_run from anon;

-- finish_orchestrator_run(): único caminho de fechamento de um run.
-- Valida que quem fecha é quem abriu (auth.uid() = actor_profile_id
-- do run), nunca um p_run_id sozinho como autorização.
create function public.finish_orchestrator_run(
  p_run_id uuid,
  p_status text,
  p_called_tools text[] default '{}',
  p_error text default null,
  p_fallback_used boolean default false
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
      latency_ms = extract(epoch from (now() - started_at)) * 1000
  where id = p_run_id
  returning * into v_run;

  return v_run;
end;
$$;

comment on function public.finish_orchestrator_run is 'Único caminho de fechamento de um orchestrator_run. Só quem abriu o run (mesmo actor_profile_id) pode fechá-lo.';

revoke all on function public.finish_orchestrator_run from public;
grant execute on function public.finish_orchestrator_run to authenticated;
revoke execute on function public.finish_orchestrator_run from anon;

-- ============================================================
-- ai_usage_events ganha run_id (aditivo, nullable) — liga um evento
-- de uso de IA ao run do Core que o originou, quando aplicável. Nem
-- todo evento de uso nasce de um run do Core (ex.: o teste de
-- infraestrutura da migration 0041 não usa o Core ainda).
-- ============================================================
alter table public.ai_usage_events
  add column run_id uuid references public.orchestrator_runs (id) on delete set null;

comment on column public.ai_usage_events.run_id is 'Liga o evento de uso de IA ao orchestrator_run que o originou, quando aplicável.';

-- CREATE OR REPLACE não basta aqui: acrescentar p_run_id muda a
-- assinatura (novo tipo na lista de argumentos), então o Postgres
-- criaria uma segunda function sobrecarregada em vez de substituir a
-- da migration 0041 — precisa dropar a assinatura antiga primeiro.
drop function public.log_ai_usage_event(text, text, text, uuid, integer, integer);

create function public.log_ai_usage_event(
  p_feature text,
  p_model text,
  p_status text,
  p_conversation_id uuid default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_run_id uuid default null
)
returns public.ai_usage_events
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.ai_usage_events;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_id is not null then
    if not exists (
      select 1 from public.conversations
      where id = p_conversation_id and represented_professional_id = auth.uid()
    ) then
      raise exception 'conversation_not_owned' using errcode = '42501';
    end if;
  end if;

  -- Mesmo padrão de posse do conversation_id acima: um run só pode ser
  -- referenciado por quem o abriu.
  if p_run_id is not null then
    if not exists (
      select 1 from public.orchestrator_runs
      where id = p_run_id and represented_professional_id = auth.uid()
    ) then
      raise exception 'run_not_owned' using errcode = '42501';
    end if;
  end if;

  insert into public.ai_usage_events (
    profile_id, conversation_id, feature, model, status, input_tokens, output_tokens, run_id
  ) values (
    auth.uid(), p_conversation_id, p_feature, p_model, p_status, p_input_tokens, p_output_tokens, p_run_id
  )
  returning * into v_event;

  return v_event;
end;
$$;

comment on function public.log_ai_usage_event is 'Único caminho de INSERT em ai_usage_events pra authenticated. profile_id é sempre auth.uid(), nunca um parâmetro; conversation_id e run_id, quando informados, precisam pertencer a quem chama.';

revoke all on function public.log_ai_usage_event from public;
grant execute on function public.log_ai_usage_event to authenticated;
revoke execute on function public.log_ai_usage_event from anon;
