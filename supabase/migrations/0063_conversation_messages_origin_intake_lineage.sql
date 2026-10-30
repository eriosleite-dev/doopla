-- Doopla Intelligence OS v1 — WhatsApp Inbound Foundation, fechamento
-- de lineage. Achado da checagem final: conversation_messages.origin_intake_id
-- (0062) já apontava, por desenho e comentário, pra
-- channel_inbound_intake_messages.id (a MENSAGEM específica, nunca a
-- sessão) — mas nunca ganhou FK nem UNIQUE de verdade, então a
-- garantia de reconstrução 1:1 dependia só da lógica de aplicação
-- (materialize_channel_inbound_intake_message), nunca do banco.
--
-- Cadeia completa depois desta migration, 100% por FK/UNIQUE, nunca
-- inferência por body/timestamp:
--   inbound_events.id
--     <- channel_inbound_intake_messages.inbound_event_id (unique, já existia)
--     <- channel_inbound_intake_messages.materialized_conversation_message_id (unique, novo)
--     <- conversation_messages.origin_intake_id (unique, novo, FK novo)
-- Cada seta é 1:1 real — nunca duas conversation_messages podem
-- reivindicar a mesma intake_message como origem, e nunca duas
-- intake_messages podem apontar pra mesma conversation_message.

alter table public.conversation_messages
  add constraint conversation_messages_origin_intake_id_fkey
  foreign key (origin_intake_id) references public.channel_inbound_intake_messages (id) on delete restrict;

alter table public.conversation_messages
  add constraint conversation_messages_origin_intake_id_key unique (origin_intake_id);

alter table public.channel_inbound_intake_messages
  add constraint channel_inbound_intake_messages_materialized_msg_id_key unique (materialized_conversation_message_id);

comment on column public.conversation_messages.origin_intake_id is 'WhatsApp Inbound Foundation — referência 1:1 (FK + UNIQUE) à channel_inbound_intake_messages.id específica que originou esta mensagem, nunca à sessão (channel_inbound_intakes). Nulo pra 100% das mensagens fora do caminho de intake (identidade já conhecida). Reconstrução completa provider_event -> inbound_event -> intake_message -> conversation_message é sempre por FK, nunca por inferência de body/timestamp.';
