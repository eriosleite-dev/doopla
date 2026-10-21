-- Doopla Intelligence Core v1 — Passo 4a (Beta Runtime Integration:
-- painel). runtime_pending_replies (migration 0053) foi criada sem
-- nenhuma policy pra authenticated/anon de propósito ("estado interno
-- do Orchestrator") — mas o painel precisa, agora, ler exclusivamente
-- as próprias pendências do profissional autenticado, sob RLS real
-- (nunca service_role). Única mudança desta migration: 1 policy de
-- SELECT, mesmo padrão já estabelecido em "conversation_messages:
-- select via conversation" (migration 0039) — posse resolvida via
-- conversations.represented_professional_id, única fonte de verdade
-- de dono, nunca uma coluna professional_id duplicada nesta tabela.
--
-- Deliberadamente SEM policy de INSERT/UPDATE/DELETE pra authenticated
-- — o painel nunca deve ganhar capacidade de mutar estado interno do
-- Orchestrator; toda escrita continua exclusiva das functions security
-- definer já existentes (create_runtime_pending_reply e as demais).

create policy "runtime_pending_replies: select own" on public.runtime_pending_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = runtime_pending_replies.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );
