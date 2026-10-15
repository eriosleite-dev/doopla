-- Doopla Intelligence Core v1 — Runtime: Fase 2 do roadmap de
-- confiabilidade do AI Engineering Charter (ADR 0002, seção 12 —
-- proposta mínima aprovada pela fundadora/Head of AI, 15/10/2026).
--
-- Objetivo: recuperar automaticamente mensagens já CAPTURADAS (Fase 1)
-- mas que nunca concluíram o processamento — sem reintroduzir o único
-- risco real já mapeado (seção 12.1 do ADR): reenviar um prompt de
-- desambiguação que a tentativa interrompida pode já ter mandado.
--
-- Esta migration adiciona só UMA function nova — seleção grosseira em
-- SQL (status elegível + teto de tentativas). Nenhum mecanismo novo de
-- claim/lease: o sweep reclama cada captura elegível com a MESMA
-- claim_whatsapp_inbound_raw_capture_for_processing de sempre (0112) —
-- a seleção aqui só decide QUEM entra na fila, nunca reimplementa a
-- exclusão mútua. O backoff fino (espaçamento entre tentativas de
-- needs_attention) fica do lado do TS (reaproveita
-- computeRuntimeRetryBackoffSeconds, runtime/retry-backoff.ts — nunca
-- uma segunda fórmula de backoff duplicada em SQL).

create function public.list_whatsapp_inbound_raw_captures_for_sweep(
  p_max_attempts integer default 8,
  p_limit integer default 50
)
returns setof public.whatsapp_inbound_raw_captures
language sql
security definer set search_path = public
stable
as $$
  select *
  from public.whatsapp_inbound_raw_captures
  where
    -- Passagem 2 nunca nem começou pra esta mensagem (processo
    -- morreu entre a Passagem 1 e a Passagem 2, ou no meio do loop da
    -- Passagem 2 antes de chegar nesta mensagem) — zero execução
    -- aconteceu, zero risco por construção.
    status = 'pending'
    -- Passagem 2 começou mas o worker morreu no meio (lease vencida,
    -- nunca chamou finish) — destino desconhecido, mas o claim de
    -- concorrência (0112) já impede duas execuções simultâneas; o
    -- sweep só reconta como uma tentativa normal.
    or (status = 'processing' and lease_expires_at < now())
    -- needs_attention só entra se ainda não esgotou o teto de
    -- tentativas E não é um resultado sabidamente determinístico-nunca-
    -- muda (invalid_phone) nem um bloqueio de desenho deliberado
    -- (ambiguous_retry_blocked — ver evaluateWhatsappInboundRoutingSafety,
    -- intake-orchestration.ts: identidade não resolve de forma
    -- determinística, retomar sozinho arriscaria reenviar um prompt).
    or (
      status = 'needs_attention'
      and attempt_count < p_max_attempts
      and (result_kind is null or result_kind not in ('invalid_phone', 'ambiguous_retry_blocked'))
    )
  order by captured_at asc
  limit p_limit;
$$;

comment on function public.list_whatsapp_inbound_raw_captures_for_sweep is 'Fase 2 (ADR 0002, seção 12) — seleção grosseira pro sweep de recuperação. Nunca inclui invalid_phone nem ambiguous_retry_blocked (nenhum dos dois se resolve com uma retentativa — o primeiro é determinístico, o segundo é bloqueio de desenho até sendSystemWhatsappMessage ter idempotência própria, pré-requisito da Fase 3). O backoff fino entre tentativas de needs_attention é aplicado no TS (computeRuntimeRetryBackoffSeconds), não aqui — esta function só filtra o teto duro de tentativas.';

revoke all on function public.list_whatsapp_inbound_raw_captures_for_sweep from public;
grant execute on function public.list_whatsapp_inbound_raw_captures_for_sweep to service_role;
revoke execute on function public.list_whatsapp_inbound_raw_captures_for_sweep from anon, authenticated;
