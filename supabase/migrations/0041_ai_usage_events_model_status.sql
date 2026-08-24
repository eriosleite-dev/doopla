-- Doopla Intelligence OS v1 — teste mínimo de integração com a OpenAI
-- (infraestrutura, não o Orchestrator). Duas colunas aditivas em
-- ai_usage_events (model, status) + a function que grava nela.
--
-- authenticated nunca teve INSERT direto em ai_usage_events — desde o
-- Bloco 4.5 (migration 0019/0021) só service_role escreve. Em vez de
-- introduzir uma service-role key só pra isso, log_ai_usage_event()
-- segue o mesmo modelo de confiança das functions de conversations
-- (0039/0040): security definer, nunca aceita profile_id vindo de
-- fora (sempre auth.uid()), e valida que a conversa, quando
-- informada, pertence a quem está chamando.

alter table public.ai_usage_events
  add column model text,
  add column status text check (status in ('success', 'error'));

comment on column public.ai_usage_events.model is 'Nome do modelo usado na chamada (ex.: gpt-5-mini) — vem sempre de src/lib/intelligence/config.ts, nunca hardcoded no chamador.';
comment on column public.ai_usage_events.status is 'success | error — se a chamada ao provider terminou com resposta ou com falha.';

create function public.log_ai_usage_event(
  p_feature text,
  p_model text,
  p_status text,
  p_conversation_id uuid default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null
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

  insert into public.ai_usage_events (
    profile_id, conversation_id, feature, model, status, input_tokens, output_tokens
  ) values (
    auth.uid(), p_conversation_id, p_feature, p_model, p_status, p_input_tokens, p_output_tokens
  )
  returning * into v_event;

  return v_event;
end;
$$;

comment on function public.log_ai_usage_event is 'Único caminho de INSERT em ai_usage_events pra authenticated. profile_id é sempre auth.uid(), nunca um parâmetro; conversation_id, quando informado, precisa pertencer a quem chama.';

revoke all on function public.log_ai_usage_event from public;
grant execute on function public.log_ai_usage_event to authenticated;

-- Achado ao testar esta migration localmente: a configuração padrão
-- do projeto no Supabase concede EXECUTE em toda function nova pra
-- `anon`/`authenticated` de forma DIRETA (via "alter default
-- privileges", não via o role PUBLIC) — "revoke all ... from public"
-- (usado aqui e nas três functions da migration 0039) nunca removia
-- essa concessão direta de `anon`. O comportamento de segurança em si
-- nunca dependeu disso — cada function já valida `auth.uid()` como
-- primeira linha, então uma chamada de `anon` (sem claim de sub)
-- sempre foi barrada na prática — mas a trava de privilégio
-- documentada como "só authenticated pode nem tentar chamar" não
-- estava de fato em vigor. Fecha isso aqui pras quatro functions do
-- Intelligence OS, incluindo as três já aplicadas na 0039.
revoke execute on function public.create_conversation from anon;
revoke execute on function public.set_conversation_mandate from anon;
revoke execute on function public.advance_conversation_state from anon;
revoke execute on function public.log_ai_usage_event from anon;
