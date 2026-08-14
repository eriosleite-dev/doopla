-- Doopla — Bloco 4.5: consolidação das duas auditorias de risco que
-- rodaram em paralelo (branch `claude/doopla-bloco-4-5-opportunities-*`,
-- PR #2, vs. este branch, migration `0019_bloco_4_5_security_hardening.sql`).
--
-- As duas auditorias cobriram achados DIFERENTES e nenhuma das duas
-- estava completa sozinha — inclusive uma recursão de RLS que quebra
-- qualquer select/update real de oportunidade (F0 abaixo) passou batido
-- nas duas, porque nenhuma tinha testado antes contra uma role não-
-- superusuário de verdade. Esta migration fecha o que faltava dos dois
-- lados e resolve as duas divergências de abordagem que existiam:
--
-- 1. select_booker_for_opportunity(): a versão desta migration (0019)
--    restringiu a chamada só ao artista, o que fecha o buraco de um
--    booker se autoselecionar sem convite/interesse — mas também quebra
--    o fluxo legítimo do roteiro: "o primeiro booker efetivamente
--    selecionado, seja ACEITANDO CONVITE DIRETO, seja sendo escolhido
--    entre os interessados" — ou seja, o booker aceitar o PRÓPRIO convite
--    direto pendente É a seleção nesse caminho, não uma ação do artista.
--    Correção: artista pode selecionar qualquer booker; o próprio booker
--    só pode se autoselecionar se existir um `opportunity_invitations`
--    pendente de verdade endereçado a ele — fecha o buraco sem matar o
--    fluxo.
--
-- 2. opportunity_events insert: esta migration (0019) exige vínculo real
--    (convite ou interesse) mas não restringe `event_type` — um booker
--    convidado ainda conseguia inserir `event_type = 'selecionado'` pra
--    si mesmo. O PR #2 restringia `event_type = 'aberta'` mas não exigia
--    vínculo. Combinado: exige as duas coisas.
--
-- O resto dos achados do PR #2 que não tinham equivalente aqui (F0, trava
-- de coluna de `opportunities`/`opportunity_invitations`/`booker_profiles`,
-- pin de status na criação, vazamento de `opportunity_tags`) entra como
-- vem, sem sobreposição com o que já existia neste branch.

-- =====================================================================
-- F0 (crítico, bloqueante) — recursão infinita entre as policies de
-- SELECT de `opportunities` e `opportunity_invitations`: a policy de
-- opportunities consulta opportunity_invitations (pra ver se o booker
-- foi convidado), e a de opportunity_invitations consulta opportunities
-- de volta (pra ver se quem pergunta é o artista dono). O Postgres
-- expande as duas em tempo de rewrite da query, não avalia por linha com
-- curto-circuito, e cai em "infinite recursion detected in policy" —
-- quebraria qualquer select/update real de oportunidade. Não constava em
-- nenhuma das duas auditorias porque as duas testaram como superusuário
-- (`postgres`), que ignora RLS por completo.
--
-- Correção padrão pra referência circular de RLS: a checagem "booker
-- convidado" sai de uma subquery direta (sujeita a RLS) e vai pra dentro
-- de uma função security definer, que roda como dono da tabela e não
-- reaciona RLS de opportunity_invitations por dentro — quebra o ciclo
-- sem tirar a regra de visibilidade.
-- =====================================================================

create function public.is_booker_invited_to_opportunity(p_opportunity_id uuid, p_booker_profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.opportunity_invitations oi
    where oi.opportunity_id = p_opportunity_id and oi.booker_profile_id = p_booker_profile_id
  );
$$;

drop policy "opportunities: select open, own or invited" on public.opportunities;

create policy "opportunities: select open, own or invited" on public.opportunities
  for select using (
    auth.uid() = artist_profile_id
    or (
      status in ('aberta', 'em_distribuicao', 'interesse_recebido')
      and distribution_mode in ('novos_bookers', 'ambos')
    )
    or public.is_booker_invited_to_opportunity(id, auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- =====================================================================
-- Divergência 1 — select_booker_for_opportunity(): artista continua
-- livre pra selecionar qualquer booker (convite direto já aceito, ou
-- escolha entre interessados). O próprio booker só pode se autoselecionar
-- quando existe um convite pendente de verdade endereçado a ele —
-- fecha o buraco de autosseleção sem convite (achado real da 0019) sem
-- quebrar "booker aceita o próprio convite direto" (comportamento do
-- roteiro, não bug).
-- =====================================================================

create or replace function public.select_booker_for_opportunity(
  p_opportunity_id uuid,
  p_booker_profile_id uuid
)
returns public.opportunities
language plpgsql
security definer set search_path = public
as $$
declare
  v_opportunity public.opportunities;
begin
  select * into v_opportunity
  from public.opportunities
  where id = p_opportunity_id
  for update;

  if v_opportunity is null then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  if auth.uid() = v_opportunity.artist_profile_id then
    -- artista pode selecionar qualquer booker.
    null;
  elsif auth.uid() = p_booker_profile_id then
    -- booker só se autoseleciona com convite direto pendente de verdade.
    if not exists (
      select 1 from public.opportunity_invitations oi
      where oi.opportunity_id = p_opportunity_id
        and oi.booker_profile_id = p_booker_profile_id
        and oi.status = 'pendente'
    ) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if v_opportunity.selected_booker_id is not null then
    raise exception 'opportunity_already_filled' using errcode = 'P0001';
  end if;

  update public.opportunities
  set status = 'booker_selecionado',
      selected_booker_id = p_booker_profile_id,
      selected_at = now()
  where id = p_opportunity_id
  returning * into v_opportunity;

  update public.opportunity_invitations
  set status = 'aceita', responded_at = now()
  where opportunity_id = p_opportunity_id
    and booker_profile_id = p_booker_profile_id
    and status = 'pendente';

  with closed as (
    update public.opportunity_invitations
    set status = 'encerrada', responded_at = now()
    where opportunity_id = p_opportunity_id
      and booker_profile_id <> p_booker_profile_id
      and status = 'pendente'
    returning booker_profile_id
  )
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  select p_opportunity_id, booker_profile_id, 'encerrada', 'sistema' from closed;

  update public.opportunity_interests
  set status = 'selecionado'
  where opportunity_id = p_opportunity_id
    and booker_profile_id = p_booker_profile_id
    and status = 'pendente';

  with closed as (
    update public.opportunity_interests
    set status = 'encerrado'
    where opportunity_id = p_opportunity_id
      and booker_profile_id <> p_booker_profile_id
      and status = 'pendente'
    returning booker_profile_id
  )
  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  select p_opportunity_id, booker_profile_id, 'encerrada', 'sistema' from closed;

  insert into public.opportunity_events (opportunity_id, booker_profile_id, event_type, source)
  values (p_opportunity_id, p_booker_profile_id, 'selecionado', 'artista');

  return v_opportunity;
end;
$$;

comment on function public.select_booker_for_opportunity is 'Único caminho pra preencher opportunities.selected_booker_id. Artista seleciona qualquer booker; o próprio booker só se autoseleciona com opportunity_invitations pendente de verdade (aceitar o próprio convite direto). Levanta opportunity_already_filled (P0001) se outro booker já foi selecionado, not_authorized (42501) fora desses dois casos.';

-- =====================================================================
-- Divergência 2 — opportunity_events insert: combina a exigência de
-- vínculo real (convite ou interesse, já em 0019) com a restrição de
-- event_type = 'aberta' (só isso que o cliente deveria logar sozinho —
-- todo o resto já nasce via trigger ou vem de dentro da função).
-- =====================================================================

drop policy "opportunity_events: insert by involved booker or admin" on public.opportunity_events;

create policy "opportunity_events: insert by involved booker or admin" on public.opportunity_events
  for insert with check (
    (
      auth.uid() = booker_profile_id
      and event_type = 'aberta'
      and (
        exists (
          select 1 from public.opportunity_invitations oi
          where oi.opportunity_id = opportunity_events.opportunity_id
            and oi.booker_profile_id = auth.uid()
        )
        or exists (
          select 1 from public.opportunity_interests oint
          where oint.opportunity_id = opportunity_events.opportunity_id
            and oint.booker_profile_id = auth.uid()
        )
        or public.is_booker_invited_to_opportunity(opportunity_events.opportunity_id, auth.uid())
      )
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- =====================================================================
-- Achados do PR #2 sem equivalente neste branch — entram como estão.
-- =====================================================================

-- opportunities: status/selected_booker_id/selected_at só graváveis pela
-- função acima, nunca por update direto do cliente.
revoke update on public.opportunities from authenticated;
grant update (
  description,
  commission_percent,
  cache_amount_cents,
  distribution_mode,
  work_type,
  category,
  location,
  event_date,
  cache_min_cents,
  cache_max_cents,
  ai_tags_status,
  ai_tags_content_hash,
  ai_tags_processed_at
) on public.opportunities to authenticated;

-- opportunity_invitations: o booker convidado só edita status/responded_at
-- direto (e só pra 'recusada', pela policy já existente) — opportunity_id/
-- booker_profile_id ficam imutáveis pelo cliente.
revoke update on public.opportunity_invitations from authenticated;
grant update (status, responded_at) on public.opportunity_invitations to authenticated;

-- booker_profiles.representation_request_limit: só ajustável manualmente
-- (curadoria admin/DB direto), nunca pelo próprio booker.
revoke update on public.booker_profiles from authenticated;
grant update (
  company_name, venue_name, position, modo_trabalho, perfil, foco, mercados,
  quem, cidades, ja_representa, roster, opportunities_seen_at, created_at, updated_at
) on public.booker_profiles to authenticated;

-- Pin de status = 'pendente' na criação — nenhuma das três tabelas deve
-- aceitar um registro já "resolvido" (ex.: interesse nascendo
-- 'selecionado') na hora do insert. `opportunity_invitations` mantém a
-- checagem de distribution_mode que já existia na 0019.

drop policy "representation_requests: insert own" on public.representation_requests;
create policy "representation_requests: insert own" on public.representation_requests
  for insert with check (auth.uid() = booker_profile_id and status = 'pendente');

drop policy "opportunity_invitations: insert by artist" on public.opportunity_invitations;
create policy "opportunity_invitations: insert by artist" on public.opportunity_invitations
  for insert with check (
    status = 'pendente'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.artist_profile_id = auth.uid()
        and o.distribution_mode in ('meus_bookers', 'ambos')
    )
  );

drop policy "opportunity_interests: insert own" on public.opportunity_interests;
create policy "opportunity_interests: insert own" on public.opportunity_interests
  for insert with check (
    auth.uid() = booker_profile_id
    and status = 'pendente'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.distribution_mode in ('novos_bookers', 'ambos')
        and o.status in ('aberta', 'em_distribuicao', 'interesse_recebido')
    )
  );

-- opportunity_tags: select alinhado com a visibilidade real de
-- opportunities (dono, aberta em modo de descoberta aberta, convidado,
-- ou admin) — a versão anterior vazava tags de oportunidade em modo
-- 'meus_bookers' pra qualquer booker autenticado. Insert pina
-- source = 'explicit' (o pipeline de IA de verdade roda com service
-- role, que não passa por RLS).

drop policy "opportunity_tags: select open or own" on public.opportunity_tags;
create policy "opportunity_tags: select open, own or invited" on public.opportunity_tags
  for select using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (
          auth.uid() = o.artist_profile_id
          or (
            o.status in ('aberta', 'em_distribuicao', 'interesse_recebido')
            and o.distribution_mode in ('novos_bookers', 'ambos')
          )
          or public.is_booker_invited_to_opportunity(o.id, auth.uid())
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
        )
    )
  );

drop policy "opportunity_tags: insert by artist" on public.opportunity_tags;
create policy "opportunity_tags: insert by artist" on public.opportunity_tags
  for insert with check (
    source = 'explicit'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );
