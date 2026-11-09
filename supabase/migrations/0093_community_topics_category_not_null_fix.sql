-- Doopla — Fecha gap real de produção: `community_topics.category_id`
-- continuava `NOT NULL` mesmo depois da migration 0088 ("busca
-- universal, sem taxonomia fechada obrigatória") ter sido decidida e
-- ter sua FUNCTION (`create_community_topic`) corretamente propagada
-- pra produção via migration 0089 (que recria a function já com
-- categoria opcional) — só o `alter table ... drop not null` da 0088
-- em si nunca chegou a rodar em `doopla` (achado real durante smoke
-- test pós-promoção da branch canônica, 22/09/2026: criar um tópico
-- sem categoria falhava com `null value in column "category_id" of
-- relation "community_topics" violates not-null constraint`).
--
-- Já aplicado manualmente em produção nesta mesma rodada (confirmado
-- ao vivo: criação de tópico sem categoria funcionando depois) — este
-- arquivo só registra formalmente a migration que faltava no
-- histórico, idêntica à parte 1 de 0088 (a parte 2, da function, não é
-- repetida aqui de propósito: já está correta em produção via 0089,
-- repetir o `create or replace` da versão de 5 parâmetros da 0088
-- criaria uma segunda function/overload ao lado da de 6 parâmetros
-- já viva — mesmo risco já documentado em 0089).
--
-- QA (`doopla-qa-staging`) já tinha essa coluna nullable — confirmado
-- antes de aplicar em produção, migration idempotente aqui pra
-- qualquer ambiente que ainda não tenha essa parte de 0088.
alter table public.community_topics
  alter column category_id drop not null;

comment on column public.community_topics.category_id is 'Nullable desde 16/09/2026 (busca universal) — null significa tópico sem categoria escolhida, decisão de produto explícita pra não forçar taxonomia fechada na criação. search_community_topics/get_community_for_you_topics já toleram null (boost condicional, nunca obrigatório).';
