-- "Doopla chama o cliente" — correção pré-Etapa 2 (13/10/2026).
--
-- Achado ao desenhar a Etapa 2: cada mensagem de um profissional
-- verificado pro WhatsApp oficial cria uma conversa professional_self
-- NOVA (confirmado em create_conversation, migration 0082 — o ramo de
-- reaproveitamento só vale quando p_external_participant_id não é
-- nulo, e professional_self NUNCA tem external_participant_id). Ou
-- seja, a pergunta de confirmação da Doopla e a resposta "sim" do
-- profissional nascem em conversas DIFERENTES — trigger_message_id/
-- confirmation_message_id/decision_message_id como FK pra
-- conversation_messages nunca teriam como se correlacionar de forma
-- confiável entre turnos.
--
-- Correção: os 3 campos passam a guardar o provider_message_id (wamid)
-- da Meta — sempre único, sempre disponível no momento do webhook,
-- antes mesmo de qualquer conversation_messages existir pra aquele
-- turno. Tabela ainda sem nenhuma linha gravada (Etapa 1 só criou o
-- schema) — zero dado em risco, mudança de tipo direta.
alter table public.pending_delegated_contacts
  drop constraint pending_delegated_contacts_trigger_message_id_fkey,
  drop constraint pending_delegated_contacts_confirmation_message_id_fkey,
  drop constraint pending_delegated_contacts_decision_message_id_fkey;

alter table public.pending_delegated_contacts
  alter column trigger_message_id type text using trigger_message_id::text,
  alter column confirmation_message_id type text using confirmation_message_id::text,
  alter column decision_message_id type text using decision_message_id::text;

comment on column public.pending_delegated_contacts.trigger_message_id is 'provider_message_id (wamid) da mensagem do profissional que originou o pedido — nunca conversation_messages.id (cada mensagem professional_self nasce numa conversa nova, ver comentário acima).';
comment on column public.pending_delegated_contacts.confirmation_message_id is 'provider_message_id (wamid) da mensagem de confirmação enviada pela Doopla — correlação da aprovação.';
comment on column public.pending_delegated_contacts.decision_message_id is 'provider_message_id (wamid) da mensagem do profissional que decidiu (sim/não/cancela).';
