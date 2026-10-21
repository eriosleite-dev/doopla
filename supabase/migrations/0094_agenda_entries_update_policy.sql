-- Doopla — permite editar uma marcação de agenda existente (30/09/2026,
-- achado real de QA: fundadora marcou uma viagem de 10 dias e quis
-- encurtar o período em vez de excluir tudo e recriar). `agenda_entries`
-- (migration 0030) só tinha policies de select/insert/delete — editar
-- (mudar tipo/período/nota de um registro já existente, sem apagar e
-- recriar) sempre falhava fail-closed por falta de policy de UPDATE
-- (RLS nega por padrão quando nenhuma policy cobre o comando).
--
-- Mesma condição de autorização já usada em "insert own or represented"/
-- "delete own or represented" (0030): o próprio artista, ou um booker
-- com representation ativa pra ele. USING valida a condição na linha
-- ATUAL (quem pode tocar o registro); WITH CHECK valida a MESMA condição
-- no resultado da atualização — como cada chamador só representa/é um
-- artista específico, isso já impede reatribuir artist_profile_id pra
-- outro artista que o chamador não represente (a nova linha teria que
-- passar pela mesma checagem de representation, que falharia). A Server
-- Action (updateAgendaEntryAction) nunca envia artist_profile_id/
-- created_by_profile_id no payload de update de qualquer forma — essa
-- policy é defesa em profundidade, não a única barreira.
create policy "agenda_entries: update own or represented" on public.agenda_entries
  for update using (
    auth.uid() = artist_profile_id
    or exists (
      select 1 from public.representations r
      where r.artist_profile_id = agenda_entries.artist_profile_id
        and r.booker_profile_id = auth.uid()
    )
  )
  with check (
    auth.uid() = artist_profile_id
    or exists (
      select 1 from public.representations r
      where r.artist_profile_id = agenda_entries.artist_profile_id
        and r.booker_profile_id = auth.uid()
    )
  );
