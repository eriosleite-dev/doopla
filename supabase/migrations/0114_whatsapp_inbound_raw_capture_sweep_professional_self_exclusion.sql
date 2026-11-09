-- Correção incremental (achado da revisão final de segurança da Fase 2
-- pelo Head of AI, 15/10/2026 — ADR 0002, seção 14) sobre a 0113, já
-- aplicada em staging na sua versão original. Nunca editamos uma
-- migration já registrada/aplicada — mesmo padrão já usado pela 0110
-- (correção incremental sobre a 0109): esta function é substituída
-- via CREATE OR REPLACE, preservando a rastreabilidade entre o que
-- está registrado como aplicado em cada ambiente e o arquivo no repo.
--
-- O que mudou: a auditoria encontrou que uma identidade resolvida pro
-- próprio profissional (verified_professional) durante a retomada
-- automática pode alcançar sendProfessionalSelfReplyViaWhatsapp — um
-- envio direto ao WhatsApp, fora de outbound_intents, sem idempotência
-- própria (ver intake-orchestration.ts,
-- evaluateWhatsappInboundRoutingSafety/handleWhatsappInboundMessage).
-- A 0113 só excluía invalid_phone e ambiguous_retry_blocked da seleção
-- do sweep; esta migration estende a exclusão pra também cobrir
-- professional_self_retry_blocked, o novo result_kind que o código TS
-- já passa a gravar quando o gate de execução bloqueia esse caminho.
--
-- Mesma lógica, mesma assinatura, mesmo comportamento pros 2 motivos
-- de exclusão anteriores — só adiciona o terceiro.

create or replace function public.list_whatsapp_inbound_raw_captures_for_sweep(
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
    -- muda (invalid_phone) nem um bloqueio de desenho deliberado —
    -- ambiguous_retry_blocked (identidade não resolve de forma
    -- determinística) ou professional_self_retry_blocked (achado desta
    -- migration: identidade verificada ->
    -- sendProfessionalSelfReplyViaWhatsapp, envio direto sem
    -- idempotência própria, pipeline.ts) — ver
    -- evaluateWhatsappInboundRoutingSafety/handleWhatsappInboundMessage
    -- (intake-orchestration.ts): retomar sozinho arriscaria reenviar
    -- um prompt ou duplicar um envio direto.
    or (
      status = 'needs_attention'
      and attempt_count < p_max_attempts
      and (result_kind is null or result_kind not in ('invalid_phone', 'ambiguous_retry_blocked', 'professional_self_retry_blocked'))
    )
  order by captured_at asc
  limit p_limit;
$$;

comment on function public.list_whatsapp_inbound_raw_captures_for_sweep is 'Fase 2 (ADR 0002, seção 12; exclusão de professional_self_retry_blocked adicionada na seção 14, migration 0114) — seleção grosseira pro sweep de recuperação. Nunca inclui invalid_phone (determinístico), ambiguous_retry_blocked (identidade ambígua, sendSystemWhatsappMessage sem idempotência própria) nem professional_self_retry_blocked (identidade verificada, sendProfessionalSelfReplyViaWhatsapp sem idempotência própria). O backoff fino entre tentativas de needs_attention é aplicado no TS (computeRuntimeRetryBackoffSeconds), não aqui — esta function só filtra o teto duro de tentativas.';

-- CREATE OR REPLACE preserva os grants já concedidos pela 0113, mas
-- reafirmamos explicitamente aqui por clareza e auditabilidade (mesmo
-- padrão de rigor das migrations anteriores) — nunca depender de
-- comportamento implícito do Postgres sem documentá-lo.
revoke all on function public.list_whatsapp_inbound_raw_captures_for_sweep from public;
grant execute on function public.list_whatsapp_inbound_raw_captures_for_sweep to service_role;
revoke execute on function public.list_whatsapp_inbound_raw_captures_for_sweep from anon, authenticated;
