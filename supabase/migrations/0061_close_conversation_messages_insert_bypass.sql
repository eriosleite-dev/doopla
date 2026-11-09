-- Doopla Intelligence OS v1 — Conversas, fechamento do blocker de
-- segurança identificado na auditoria do Bloco 1: a policy
-- "conversation_messages: insert own professional message" (0039)
-- permanecia tecnicamente utilizável por qualquer client authenticated
-- — um insert direto ali pula claim_inbound_event/lease/Classifier/
-- Planner/Approval Engine/Policy Gate inteiros, deixando a mensagem
-- "órfã" de todas as garantias do Runtime. A proteção real até aqui
-- era só convenção de código (comentário em
-- professional-reply-action.ts): "NUNCA usar a policy... diretamente".
--
-- Achado que torna este fechamento seguro: a própria migration 0051
-- já documentava que essa policy nasceu de propósito ANTES do
-- Runtime existir ("a RLS de conversation_messages, 0039, só permite
-- insert direto de mensagem própria do profissional, DE PROPÓSITO") —
-- persist_inbound_message/persist_ai_message nunca dependeram dela.
-- Confirmado por busca em todo src/: nenhum caminho de produção hoje
-- faz .insert() direto em conversation_messages — sendProfessionalReplyAction
-- sempre passa por triggerInboundMessage -> processInboundEvent ->
-- persist_inbound_message. Fechar este caminho não quebra nada em uso.
--
-- DROP POLICY + REVOKE, nunca só um dos dois — mesmo padrão
-- estrutural já usado nesta mesma migration-irmã (0039) pra
-- conversations/conversation_mandate_events/conversation_state_events:
-- "isso é estrutural (nível de privilégio), não só convenção de RLS".
-- REVOKE sozinho já bloquearia (RLS nega por padrão sem grant de
-- tabela pro comando), mas deixaria a policy permissiva morta e
-- enganosa pra quem ler o schema depois — DROP a remove de vez.
--
-- Por que isto NUNCA quebra persist_inbound_message/persist_ai_message:
-- as duas são SECURITY DEFINER, com dono = quem aplicou a migration
-- (mesmo dono de public.conversation_messages) — conversation_messages
-- NUNCA teve FORCE ROW LEVEL SECURITY, então o dono da tabela sempre
-- foi estruturalmente isento de RLS, independente de qualquer
-- policy/grant desta migration ou de qualquer futura. As duas RPCs já
-- tinham EXECUTE revogado de anon/authenticated desde que nasceram —
-- só service_role chama, e nada aqui muda isso. Planner/Approval
-- Engine/Policy Gate/resumption nunca leem policy de INSERT — não são
-- tocados por esta migration.
drop policy "conversation_messages: insert own professional message" on public.conversation_messages;

-- authenticated: caminho de bypass fechado na origem (privilégio de
-- tabela, avaliado ANTES de qualquer RLS). anon: nunca deveria ter
-- ganho este grant (mesmo pg_default_acl auto-grant já documentado
-- pra functions, aqui manifestado em tabela) — já era neutralizado
-- pela RLS (author_profile_id = auth.uid() nunca casa com auth.uid()
-- nulo), mas revogado agora por defesa em profundidade explícita,
-- mesmo padrão já adotado no projeto inteiro.
revoke insert on public.conversation_messages from authenticated, anon;

comment on table public.conversation_messages is 'Só conteúdo real do thread, visível a quem participa da conversa. Tool call, decisão interna e erro técnico não pertencem aqui. INSERT fechado pra authenticated/anon desde 0061 — toda escrita passa exclusivamente por persist_inbound_message (mensagem humana, inbound) / persist_ai_message (resposta da Doopla ao profissional), ambas SECURITY DEFINER, só service_role — nunca mais por policy de RLS direta de authenticated.';
