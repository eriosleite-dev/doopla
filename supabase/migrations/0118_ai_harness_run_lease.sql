-- AI Evaluation Harness — limite de frequência no SERVIDOR (achado da
-- revisão da fundadora, 16/10/2026): o teto de 40 turnos por execução
-- (CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS) já existia, mas nada
-- impedia execuções repetidas ou simultâneas — o único controle era a
-- confirmação de 2 passos na UI, que nunca é proteção real (qualquer
-- chamada direta à Server Action ignora a UI inteira).
--
-- Reaproveita app_settings (já existente, nenhuma tabela nova) com um
-- UPDATE condicional atômico — mesmo princípio de claim/lease já usado
-- em todo o projeto (ex.: acquire_professional_self_drain_lease,
-- migration 0108), só que num valor-texto em vez de uma tabela
-- própria, porque o único dado que precisa persistir aqui é "quando
-- foi a última execução aceita". A condição no WHERE do UPDATE garante
-- atomicidade real: duas chamadas concorrentes nunca podem as duas
-- vencer a corrida (uma delas sempre encontra o valor já atualizado
-- pela outra e falha a condição).

insert into public.app_settings (key, value)
values ('ai_harness_last_run_at', (now() - interval '1 day')::text)
on conflict (key) do nothing;

create function public.claim_ai_harness_run_lease(p_cooldown_seconds integer default 120)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  -- Mesma autoridade do resto do painel /admin — nunca
  -- is_system_caller() (isso é pra chamadas service_role/cron; aqui o
  -- chamador é sempre um admin autenticado via sessão de cookie).
  perform public._assert_is_admin();

  update public.app_settings
  set value = now()::text, updated_at = now()
  where key = 'ai_harness_last_run_at'
    and (value)::timestamptz < now() - make_interval(secs => p_cooldown_seconds);

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.claim_ai_harness_run_lease is 'AI Evaluation Harness — limite de frequência real no servidor (nunca só confirmação de UI). Devolve true só pra quem de fato "ganhou" a janela de cooldown; chamadas concorrentes/repetidas dentro do período devolvem false e a Server Action deve recusar a execução.';

revoke all on function public.claim_ai_harness_run_lease from public;
grant execute on function public.claim_ai_harness_run_lease to authenticated;
revoke execute on function public.claim_ai_harness_run_lease from anon;
