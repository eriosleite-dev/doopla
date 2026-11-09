-- ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
-- pausa real de envio automático de WhatsApp em professional_self,
-- reconhecida semanticamente ("pare de me escrever"/equivalente —
-- recognizer isolado, nunca lista fixa de frases).
--
-- Deliberadamente NUNCA reaproveita conversations.mandate (achado da
-- auditoria, documentado em ADR 0009): o Pre-model Policy Gate lê
-- mandate ANTES de persistInboundMessage (pipeline.ts), então usar
-- mandate pra representar "pausada" perderia mensagens inbound
-- durante a pausa — viola "preservar inbound" (requisito explícito da
-- fundadora, ADR 0008). Coluna nova e dedicada, checada só no ponto
-- de ENVIO (sendProfessionalSelfReplyViaWhatsapp), nunca na entrada —
-- Classifier/Planner continuam rodando e persistAiMessage continua
-- escrevendo no painel normalmente enquanto pausado, mesmo princípio
-- já estabelecido pra app_settings.professional_self_auto_reply_enabled
-- (migration 0121/ADR 0008).
--
-- Nunca usada por external_inquiry — só conversas professional_self
-- chamam sendProfessionalSelfReplyViaWhatsapp.
alter table public.conversations
  add column professional_self_reply_paused_at timestamptz;

comment on column public.conversations.professional_self_reply_paused_at is 'ADR 0009 — não-nulo = profissional pediu pra Doopla parar de responder automaticamente pelo WhatsApp nesta conversation (reconhecido pelo recognizer isolado em intelligence/professional-self-pause). Checado só em sendProfessionalSelfReplyViaWhatsapp, nunca no Policy Gate. Retomada automática: qualquer mensagem nova da profissional que o recognizer classifique como signal="no_signal" limpa este campo (ver pipeline.ts). Só tem sentido pra conversation_type=''professional_self''.';

-- set_professional_self_reply_paused(): único caminho de escrita,
-- mesmo princípio estrutural de set_conversation_mandate (migration
-- 0039) — nenhuma coluna de conversations é alterada direto por
-- UPDATE solto, mesmo fora de RLS/privilégio de authenticated.
create function public.set_professional_self_reply_paused(p_conversation_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.conversations
  set professional_self_reply_paused_at = case when p_paused then now() else null end
  where id = p_conversation_id;
end;
$$;

comment on function public.set_professional_self_reply_paused is 'ADR 0009 — único caminho de escrita de conversations.professional_self_reply_paused_at. p_paused=true pausa agora; p_paused=false retoma (limpa o campo).';

revoke all on function public.set_professional_self_reply_paused from public;
grant execute on function public.set_professional_self_reply_paused to service_role;
