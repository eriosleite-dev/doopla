-- ADR 0009 (20/10/2026) — Mecanismo D do incidente P0 (ADR 0008):
-- idempotência real no único ponto de envio real de WhatsApp pra
-- professional_self (sendProfessionalSelfReplyViaWhatsapp). Histórico
-- conhecido desde a revisão de segurança da Fase 2 (ADR 0002) como
-- risco residual nunca corrigido: hoje nada impede que a MESMA
-- mensagem de IA já persistida seja enviada duas vezes pelo WhatsApp
-- (ex.: um retry do drain depois de um timeout de rede que na
-- verdade teve sucesso do lado do provider).
--
-- Chave de idempotência = conversation_messages.id da própria
-- mensagem de IA já persistida no painel (fonte de verdade existente,
-- nunca um identificador novo inventado). Nunca aplicável a
-- external_inquiry — só professional_self chama
-- sendProfessionalSelfReplyViaWhatsapp.
create table public.professional_self_whatsapp_sends (
  ai_message_id uuid primary key references public.conversation_messages (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.professional_self_whatsapp_sends is 'ADR 0009 — ledger de idempotência do envio real por WhatsApp pra professional_self. Uma linha = uma mensagem de IA (conversation_messages.id) já efetivamente enviada por claim_professional_self_whatsapp_send. Nunca usado pra decidir CONTEÚDO, só pra nunca repetir o mesmo envio físico.';

alter table public.professional_self_whatsapp_sends enable row level security;
-- Sem policy pra authenticated/anon — estado interno do Runtime, mesmo
-- padrão de professional_self_pending_messages/inbound_events.
-- service_role bypassa RLS.

-- claim_professional_self_whatsapp_send(): único caminho de escrita.
-- Atômico sob concorrência (ON CONFLICT, nunca SELECT-depois-INSERT)
-- — devolve true só na primeira vez que esta ai_message_id é
-- reivindicada; qualquer chamada repetida (retry, duas tentativas
-- concorrentes do mesmo drain) devolve false, e o chamador NUNCA
-- envia de novo quando false.
create function public.claim_professional_self_whatsapp_send(p_ai_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.professional_self_whatsapp_sends (ai_message_id)
  values (p_ai_message_id)
  on conflict (ai_message_id) do nothing
  returning ai_message_id into v_inserted;

  return v_inserted is not null;
end;
$$;

comment on function public.claim_professional_self_whatsapp_send is 'ADR 0009 — reivindica o direito de enviar p_ai_message_id pelo WhatsApp real. true = primeira vez, pode enviar. false = já reivindicada antes (enviada ou em voo), NUNCA enviar de novo.';

revoke all on function public.claim_professional_self_whatsapp_send from public;
grant execute on function public.claim_professional_self_whatsapp_send to service_role;
