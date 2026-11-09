-- Doopla — Fecha o gap de RLS em `artist_link_routing` (INSERT), achado
-- de Beta Readiness (Categoria A, §104/§105 do PROGRESS.md,
-- classificado `FAIL NON-BLOCKER → MUST FIX BEFORE BETA CLOSE`, aberto
-- desde 14/09/2026 até esta migration).
--
-- Gap real: a policy de INSERT ("artist_link_routing: upsert own",
-- migration 0023) só validava `auth.uid() = artist_id` — ao contrário
-- da policy de UPDATE (mesma migration 0023), que também exige, quando
-- `mode <> 'eu'` e `booker_id` não é nulo, que exista uma
-- `representations` ligando o artista ao booker escolhido. Como a
-- escrita real do produto é sempre um `upsert()`
-- (`updateLinkRoutingAction`, `src/app/dashboard/actions.ts`,
-- `onConflict: 'artist_id'`), a PRIMEIRA gravação de cada artista passa
-- pela policy de INSERT, não pela de UPDATE — exatamente o caminho que
-- ficava sem essa validação.
--
-- Hoje isso é blindado pela aplicação (`updateLinkRoutingAction` já
-- confere `representations` antes de chamar `upsert()`, nunca
-- explorável pelo fluxo real do produto) — mas uma sessão
-- `authenticated` válida que bypassasse o Next.js (chamando o Supabase
-- client direto) poderia gravar, na primeira escrita, um `booker_id`
-- que não representa de fato o artista. Esta migration fecha essa
-- lacuna na própria RLS — defesa em profundidade, mesmo padrão já
-- usado no resto do schema — em vez de depender só da aplicação.
--
-- Não-destrutivo, comportamento idêntico pro caminho legítimo: a nova
-- condição da policy de INSERT é EXATAMENTE a mesma condição já
-- existente na policy de UPDATE ("mode = 'eu' or booker_id is null or
-- exists (select 1 from representations ...)") — RLS de INSERT só
-- valida ESCRITAS NOVAS, nenhuma linha existente é lida/alterada por
-- esta migration, nenhum outro comportamento muda.

drop policy "artist_link_routing: upsert own" on public.artist_link_routing;

create policy "artist_link_routing: upsert own" on public.artist_link_routing
  for insert with check (auth.uid() = artist_id and (
    mode = 'eu' or booker_id is null or exists (
      select 1 from public.representations r
      where r.artist_profile_id = auth.uid() and r.booker_profile_id = booker_id
    )
  ));
