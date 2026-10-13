-- "Doopla chama o cliente" — Etapa 1, parte 2 (produto, 13/10/2026).
-- Novo valor de origin pra diferenciar uma conversa aberta a pedido do
-- profissional (destinatário terceiro, contatado pela Doopla) de uma
-- conversa aberta pelo próprio cliente (whatsapp/public_link/email).
--
-- Confirmado antes desta migration (auditoria pedida pela fundadora):
-- `conversations.origin` não é lido por NENHUM código de aplicação
-- hoje (`grep` em todo src/ não achou consumidor real) — só gravado,
-- histórico. `conversations.channel` é a coluna que telas/filtros de
-- Bookings de fato leem (get_conversation_operational_facts, migration
-- 0098, `select c.channel`), e essa continua 'whatsapp' sem mudança
-- nenhuma pra conversas delegadas (o canal de comunicação continua
-- sendo WhatsApp). Aditivo, não quebra nenhuma tela existente.
alter table public.conversations drop constraint conversations_origin_check;
alter table public.conversations add constraint conversations_origin_check
  check (origin in ('public_link', 'whatsapp', 'email', 'painel', 'outro', 'professional_delegated'));

comment on column public.conversations.origin is 'Como a conversa nasceu: public_link (formulário /orcamento/[slug]), whatsapp (cliente mandou mensagem direto), email, painel, outro, ou professional_delegated ("Doopla chama o cliente" — profissional pediu o contato pela própria Doopla, 13/10/2026). Nunca lido por código de aplicação hoje — só histórico/auditoria.';
