-- ADR 0011 (20/10/2026) — Fase A do sistema de evolução contínua:
-- feedback no WhatsApp ("Erro"/"Perfeito!" etc.), reconhecido
-- semanticamente (recognizer isolado, nunca lista de frases), nunca
-- dependente da fila de retry de professional_self
-- (professional_self_pending_messages) nem do Planner conversacional
-- — escrito direto aqui, em paralelo ao ciclo normal.
--
-- Escopo inicial (Fase A) deliberadamente mínimo: sem
-- failure_category_suggested/prompt_version ainda (Fase B, quando a
-- avaliação automática existir de verdade) — nunca construído
-- antecipadamente sem uso real, mesmo princípio de todo o projeto.
create table public.conversation_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  represented_professional_id uuid not null references public.profiles (id) on delete cascade,

  -- Mensagem do profissional que deu o feedback (ex.: "Erro").
  trigger_message_id uuid not null references public.conversation_messages (id) on delete cascade,
  -- Mensagem de IA sinalizada, quando identificável — hoje sempre a
  -- ÚLTIMA resposta de IA desta conversation (nunca uma mensagem
  -- citada/respondida diretamente no WhatsApp: a Meta manda o ID da
  -- mensagem citada no payload, mas isso não é capturado em lugar
  -- nenhum do parsing do webhook ainda — gap documentado no ADR 0011,
  -- fora de escopo desta entrega).
  flagged_message_id uuid references public.conversation_messages (id) on delete set null,

  signal text not null check (signal in ('negative', 'positive')),
  -- Texto livre do profissional, quando o feedback vier com comentário
  -- (ex.: "Erro, você não entendeu que eu já tinha confirmado").
  comment text,
  model_used text,
  -- Liga ao run que gerou a resposta sinalizada, quando conhecido —
  -- nunca obrigatório (nem toda mensagem de IA nasce de um
  -- orchestrator_run, ex.: respostas determinísticas do
  -- delegated-contact-flow.ts).
  run_id uuid references public.orchestrator_runs (id) on delete set null,

  investigation_status text not null default 'new' check (investigation_status in ('new', 'reviewing', 'resolved', 'wont_fix')),

  created_at timestamptz not null default now(),

  -- Uma linha por mensagem-gatilho — nunca duplica se o mesmo evento
  -- inbound for reprocessado (mesma disciplina de idempotência do
  -- resto do projeto).
  unique (trigger_message_id)
);

comment on table public.conversation_feedback is 'ADR 0011 Fase A — feedback semântico ("Erro"/"Perfeito!") reconhecido em professional_self, escrito em paralelo ao ciclo normal. Nunca é uma ação comercial nem altera memória/regras automaticamente — só dado estruturado pra investigação supervisionada.';

create index conversation_feedback_professional_idx on public.conversation_feedback (represented_professional_id, created_at desc);

alter table public.conversation_feedback enable row level security;
-- Sem policy pra authenticated/anon — estado interno do Runtime,
-- mesmo padrão de professional_self_pending_messages/inbound_events.
-- service_role bypassa RLS.

create function public.record_conversation_feedback(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_flagged_message_id uuid,
  p_signal text,
  p_comment text,
  p_model_used text
)
returns public.conversation_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
  v_row public.conversation_feedback;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select represented_professional_id into v_professional_id from public.conversations where id = p_conversation_id;
  if v_professional_id is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  insert into public.conversation_feedback (
    conversation_id, represented_professional_id, trigger_message_id, flagged_message_id, signal, comment, model_used
  ) values (
    p_conversation_id, v_professional_id, p_trigger_message_id, p_flagged_message_id, p_signal, p_comment, p_model_used
  )
  on conflict (trigger_message_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.conversation_feedback where trigger_message_id = p_trigger_message_id;
  end if;

  return v_row;
end;
$$;

comment on function public.record_conversation_feedback is 'ADR 0011 Fase A — único caminho de escrita de conversation_feedback. Idempotente por trigger_message_id (ON CONFLICT DO NOTHING + fallback SELECT na mesma transação, nunca uma janela de corrida).';

revoke all on function public.record_conversation_feedback from public;
grant execute on function public.record_conversation_feedback to service_role;
