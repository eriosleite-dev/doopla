-- AI Evaluation Harness — controle de concorrência REAL no servidor
-- (achado da revisão da fundadora, 16/10/2026, segunda rodada): a
-- primeira versão desta migration usava um cooldown fixo de 120s a
-- partir do INÍCIO da execução anterior — se uma execução real
-- demorasse mais que isso (plausível: até 40 turnos, até 3 chamadas
-- de modelo cada), uma segunda execução conseguiria começar enquanto
-- a primeira ainda estava rodando. Substituído por um lease de
-- verdade (claim + release explícito + expiração de segurança), mesmo
-- padrão já usado no projeto pra exclusão mútua real (ver
-- acquire_professional_self_drain_lease/release_professional_self_drain_lease,
-- migration 0108) — nunca um cooldown baseado só em timestamp de
-- início.
--
-- Comportamento comprovado contra Postgres real nesta sessão (nunca
-- só por leitura de código): (1) uma segunda tentativa de claim
-- enquanto o lease da primeira ainda está válido é bloqueada; (2)
-- depois do lease_expires_at vencer (proteção contra o servidor
-- travar/crashar no meio de uma execução sem liberar), uma nova
-- tentativa se autocura; (3) release explícito libera o lease na hora,
-- sem esperar o prazo todo; (4) um release com o token errado (worker
-- zumbi tentando liberar um lease que já foi reclamado por outro)
-- nunca afeta o lease ativo de outro.
--
-- 600s (10 min) de prazo de segurança: generoso o bastante pro pior
-- caso real (CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS=40, até 3
-- chamadas de modelo por turno, incluindo retries) nunca disparar o
-- autocura por engano durante uma execução legítima ainda em
-- andamento — só existe pra cobrir crash/timeout real do processo,
-- nunca o caminho normal (que sempre libera explicitamente ao
-- terminar, sucesso ou erro).

create table public.ai_harness_run_leases (
  -- Singleton de propósito — só existe UMA fila de execução do
  -- harness no sistema inteiro, nunca por admin/por sessão.
  id boolean primary key default true check (id),
  claimed_by uuid references public.profiles (id) on delete set null,
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_at timestamptz
);

insert into public.ai_harness_run_leases (id, claimed_by, lease_token, lease_expires_at, claimed_at)
values (true, null, null, null, null);

comment on table public.ai_harness_run_leases is 'AI Evaluation Harness — lock singleton real (claim+release), nunca um cooldown por timestamp. Ver claim_ai_harness_run_lease/release_ai_harness_run_lease.';

alter table public.ai_harness_run_leases enable row level security;
-- Sem policy pra authenticated/anon de propósito — só as functions
-- SECURITY DEFINER abaixo tocam esta tabela, cada uma reafirmando
-- _assert_is_admin() (mesma autoridade do resto do painel /admin).

create function public.claim_ai_harness_run_lease(p_lease_seconds integer default 600)
returns table (granted boolean, lease_token uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id uuid;
  v_lease_token uuid;
begin
  v_admin_id := public._assert_is_admin();
  v_lease_token := gen_random_uuid();

  update public.ai_harness_run_leases
  set claimed_by = v_admin_id, lease_token = v_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claimed_at = now()
  where id = true
    -- Só reclama se nunca foi reclamado, ou se o lease anterior já
    -- venceu (autocura de crash) — NUNCA enquanto uma execução
    -- legítima ainda está dentro do prazo de segurança.
    and (lease_expires_at is null or lease_expires_at < now());

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  return query select true, v_lease_token;
end;
$$;

comment on function public.claim_ai_harness_run_lease is 'Reivindica o lock singleton do harness. granted=false significa que outra execução ainda está dentro do prazo de segurança (lease_expires_at não vencido) — a Server Action deve recusar a execução, nunca prosseguir sem o lease.';

revoke all on function public.claim_ai_harness_run_lease from public;
grant execute on function public.claim_ai_harness_run_lease to authenticated;
revoke execute on function public.claim_ai_harness_run_lease from anon;

create function public.release_ai_harness_run_lease(p_lease_token uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  perform public._assert_is_admin();

  update public.ai_harness_run_leases
  set claimed_by = null, lease_token = null, lease_expires_at = null, claimed_at = null
  where id = true and lease_token = p_lease_token;

  return found;
end;
$$;

comment on function public.release_ai_harness_run_lease is 'Libera o lock singleton do harness — só quando o token bate com o lease ATIVO (nunca libera um lease que já foi reclamado por outra execução, ex.: um worker zumbi com lease já vencido e reclamado de novo por outro). Chamado sempre em try/finally pela Server Action, sucesso ou erro.';

revoke all on function public.release_ai_harness_run_lease from public;
grant execute on function public.release_ai_harness_run_lease to authenticated;
revoke execute on function public.release_ai_harness_run_lease from anon;
