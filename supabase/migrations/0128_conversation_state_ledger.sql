-- Doopla Intelligence Core v1 — Bloco 4+: Conversation State Ledger.
--
-- Fundação pra "o que já está estabelecido nesta conversa" (ADR —
-- Próxima fase: inteligência conversacional multiturno). NÃO reaproveita
-- conversations.current_state/conversation_state_events (migration
-- 0039): aquele par é uma state machine de RÓTULO ÚNICO ('novo' ->
-- outro rótulo, com log de transições) — formato errado pra um objeto
-- com múltiplos campos (assuntos, fatos conhecidos). Esta tabela nova é
-- aditiva e não toca em nada da 0039.
--
-- Uma linha por conversa, snapshot ATUAL (não log append-only — o que
-- importa aqui é o estado corrente, recalculado/sobrescrito a cada
-- turno real do Planner, nunca uma régua de auditoria histórica).
-- `snapshot` é jsonb de formato só do CÓDIGO (TypeScript, ver
-- src/lib/intelligence/conversation-state/types.ts) — nunca
-- preenchido/interpretado livremente pelo model.
create table public.conversation_state_ledger (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.conversation_state_ledger is 'Snapshot ATUAL (não histórico) do que já está estabelecido numa conversa — assuntos e fatos já tratados, pra o Planner nunca re-perguntar/reabrir o que já foi resolvido na própria janela de mensagens. Calculado por código determinístico (advanceConversationStateSnapshot), nunca pelo model. Formato do jsonb só no código TS, sem CHECK de schema aqui (mesmo padrão de conversations.current_state/attachment_metadata nesta base).';
comment on column public.conversation_state_ledger.snapshot is 'ConversationStateSnapshot (TypeScript) serializado. Nunca interpretado por SQL/RPC — só lido/escrito como blob opaco pelo Context Builder (leitura) e pelo Runtime Pipeline (escrita), ambos com o mesmo client de serviço de todo o resto do run.';

create trigger set_updated_at before update on public.conversation_state_ledger
  for each row execute function public.set_updated_at();

-- RLS: mesmo padrão de conversation_mandate_events/conversation_state_events
-- (migration 0039) — só leitura via posse da conversa; sem policy de
-- insert/update/delete pra authenticated. O Runtime Pipeline escreve
-- com o client de serviço (bypassa RLS, mesmo caminho já usado pra
-- conversation_messages com author_type='ai' em pipeline.ts), nunca via
-- uma sessão de usuário comum.
alter table public.conversation_state_ledger enable row level security;

create policy "conversation_state_ledger: select via conversation" on public.conversation_state_ledger
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_state_ledger.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );

revoke insert, update, delete on public.conversation_state_ledger from authenticated;
