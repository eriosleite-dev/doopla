-- Doopla — Bloco 4.5: correções da auditoria de risco (RLS + atomicidade)
-- feita antes de começar as Server Actions em cima do schema de
-- oportunidades/convites/matching. Ver docs/bloco-4-5-contrato.md pro
-- contrato completo de nomes/semântica.
--
-- =====================================================================
-- F0 (crítico, bloqueante) — recursão infinita entre as policies de
-- SELECT de `opportunities` e `opportunity_invitations`: a policy de
-- opportunities olha pra opportunity_invitations (pra decidir se o
-- booker convidado pode ver uma oportunidade em modo 'meus_bookers'), e
-- a policy de opportunity_invitations olha de volta pra opportunities
-- (pra decidir se quem pergunta é o artista dono). Postgres expande as
-- duas policies em tempo de rewrite da query — não avalia por linha com
-- curto-circuito — e cai em "infinite recursion detected in policy".
--
-- Isso não apareceu nos testes anteriores porque foram todos rodados
-- como superusuário (`postgres`), que ignora RLS por completo. Só bateu
-- ao simular de verdade o papel `authenticated` sem bypass — e teria
-- quebrado qualquer select/update real de oportunidade em produção
-- (Postgres também exige a policy de SELECT passar em UPDATE/DELETE, não
-- só a de UPDATE, por isso apareceu até num teste de F2).
--
-- Correção padrão pra referência circular de RLS: tirar o lado
-- opportunities→opportunity_invitations de uma subquery direta (sujeita
-- a RLS) e colocar dentro de uma função security definer, que roda como
-- dono da tabela e portanto não reaciona a RLS de opportunity_invitations
-- por dentro — quebra o ciclo sem tirar a regra de visibilidade.
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

-- Padrão comum aos achados de UPDATE: uma policy com `using` restringindo
-- QUEM pode mexer na linha, mas sem `with check` restringindo O QUÊ pode
-- mudar — então quem passa no `using` consegue reescrever qualquer coluna,
-- inclusive campos que deveriam ser imutáveis pelo cliente (a contraparte
-- de uma relação, ou colunas que só a função/trigger deveriam tocar).
-- RLS não tem acesso a OLD/NEW como trigger pra comparar "mudou ou não",
-- então o jeito correto de travar coluna por coluna é privilégio de coluna
-- (REVOKE/GRANT), não `with check` — daí os REVOKE/GRANT abaixo.

-- =====================================================================
-- F1 (crítico) — profiles.is_admin: "profiles: update own" (Bloco 1) não
-- restringe colunas, e is_admin é nova nesta bloco. Qualquer usuário
-- autenticado conseguia se auto-promover a admin (`update profiles set
-- is_admin = true where id = auth.uid()`), ganhando visibilidade de toda
-- oportunidade privada + insert livre em opportunity_events.
--
-- Importante: um REVOKE só de coluna (`revoke update (is_admin) on ...`)
-- NÃO seria suficiente aqui — a role já tinha UPDATE de tabela inteira
-- (concedido de largada pelo projeto Supabase), e um GRANT de tabela
-- inteira cobre implicitamente toda coluna futura; revogar só a coluna
-- não anula esse grant mais amplo. Por isso o REVOKE é da tabela inteira,
-- com o GRANT de volta listando exatamente as colunas que devem
-- continuar editáveis pelo próprio usuário — mesma dinâmica dos outros
-- achados abaixo. `id` fica de fora do grant de volta por incidência da
-- mesma classe de bug (reescrever a própria PK poderia colidir com ou
-- sequestrar o profile de outro usuário) — não era um achado numerado à
-- parte, mas sai de graça por já estarmos reescrevendo essa lista.
-- =====================================================================

revoke update on public.profiles from authenticated;
grant update (
  full_name, display_name, phone, city, state, avatar_url, role, created_at, updated_at
) on public.profiles to authenticated;

-- =====================================================================
-- F5 (médio) — booker_profiles.representation_request_limit: mesmo
-- padrão, booker conseguia subir o próprio limite de 5 pra 20 direto,
-- driblando o "ajustável manualmente por confiança/histórico". Também
-- deixamos profile_id de fora do grant de volta (mesma classe de bug dos
-- outros achados: ninguém deveria conseguir reapontar a própria linha de
-- booker_profiles pra outro profile_id via update direto).
-- =====================================================================

revoke update on public.booker_profiles from authenticated;
grant update (
  company_name, venue_name, position, perfil, foco, mercados, quem, cidades,
  ja_representa, roster, opportunities_seen_at, created_at, updated_at
) on public.booker_profiles to authenticated;

-- =====================================================================
-- F2 (alto) — opportunities: select_booker_for_opportunity() só é a
-- "única porta" se ninguém conseguir escrever selected_booker_id/status
-- por fora dela. A policy "opportunities: update own" não impedia isso:
-- o artista dono podia fazer um update direto (`status =
-- 'booker_selecionado', selected_booker_id = <qualquer uuid>`),
-- ignorando a trava de linha, o fechamento automático de convites/
-- interesses concorrentes e o log em opportunity_events. Trava por
-- coluna: essas 3 colunas passam a só ser graváveis pela função
-- (security definer, roda como dono da tabela — não afetada pelo REVOKE).
-- =====================================================================

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

comment on column public.opportunities.status is 'Só gravável direto pelo cliente ANTES deste bloco de correções, os campos status/selected_booker_id/selected_at agora são somente-leitura pra authenticated (ver REVOKE em 0009) — mudam só via select_booker_for_opportunity(). Fluxos futuros (publicar rascunho, cancelar) vão precisar da própria função security definer, não de update direto.';

-- =====================================================================
-- F3 (alto) — representation_requests: "artist responds" tinha `with
-- check (auth.uid() = artist_profile_id)`, mas nada impedia o artista de
-- reescrever booker_profile_id (ou message/expires_at) no mesmo update
-- que aceita. Como handle_representation_request_response() usa
-- new.booker_profile_id pra criar a representations, um artista mal-
-- intencionado (ou um bug de Server Action) podia sequestrar a
-- solicitação de um booker e criar a relação com outro booker qualquer.
-- Trava por coluna: só status/responded_at seguem editáveis direto.
-- =====================================================================

revoke update on public.representation_requests from authenticated;
grant update (status, responded_at) on public.representation_requests to authenticated;

-- =====================================================================
-- F4 (médio) — opportunity_invitations: "booker declines" pinava
-- `status = 'recusada'` mas não opportunity_id/booker_profile_id — um
-- booker podia reaproveitar seu próprio convite pendente e apontar pra
-- outra oportunidade qualquer, fabricando um "recusei" pra algo que
-- nunca foi convidado. Mesma trava por coluna.
-- =====================================================================

revoke update on public.opportunity_invitations from authenticated;
grant update (status, responded_at) on public.opportunity_invitations to authenticated;

-- =====================================================================
-- F6 (médio) — INSERT sem pin de status: representation_requests,
-- opportunity_invitations e opportunity_interests aceitavam status !=
-- 'pendente' já na criação (ex.: inserir uma opportunity_interests já
-- com status = 'selecionado', sem nunca ter passado pela seleção real).
-- 'pendente' é o único estado inicial válido nas três tabelas.
-- =====================================================================

drop policy "representation_requests: insert own" on public.representation_requests;
create policy "representation_requests: insert own" on public.representation_requests
  for insert with check (auth.uid() = booker_profile_id and status = 'pendente');

drop policy "opportunity_invitations: insert by artist" on public.opportunity_invitations;
create policy "opportunity_invitations: insert by artist" on public.opportunity_invitations
  for insert with check (
    status = 'pendente'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
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

-- =====================================================================
-- F7 (médio) — opportunity_events: a policy de insert deixava qualquer
-- booker gravar QUALQUER event_type pra QUALQUER opportunity_id sob o
-- próprio booker_profile_id — inclusive 'selecionado' ou 'recebida'
-- forjados, contaminando exatamente os dados que iam alimentar o
-- Matching V2. Os únicos eventos que o cliente devia poder logar sozinho
-- são 'aberta' (visualizou); todo o resto já nasce sozinho via trigger
-- (convite_enviado/interesse) ou vem de dentro de
-- select_booker_for_opportunity (selecionado/encerrada), que roda como
-- security definer e não passa por RLS.
-- =====================================================================

drop policy "opportunity_events: insert by booker or admin" on public.opportunity_events;
create policy "opportunity_events: insert by booker or admin" on public.opportunity_events
  for insert with check (
    (auth.uid() = booker_profile_id and event_type = 'aberta')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- =====================================================================
-- F8 (baixo) — opportunity_tags: o select não respeitava o mesmo recorte
-- de visibilidade de opportunities (dono, modo aberto+status certo,
-- convidado, ou admin) — vazava tags de oportunidade em modo
-- 'meus_bookers' (convite fechado) pra qualquer booker autenticado.
-- =====================================================================

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
          or exists (
            select 1 from public.opportunity_invitations oi
            where oi.opportunity_id = o.id and oi.booker_profile_id = auth.uid()
          )
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
        )
    )
  );

-- =====================================================================
-- F9 (baixo) — opportunity_tags: insert não pinava source = 'explicit',
-- o artista podia inserir uma tag com source = 'ai' se passando por
-- inferência automática (o pipeline de IA de verdade roda com service
-- role, que não passa por RLS — não precisa dessa policy pra nada).
-- =====================================================================

drop policy "opportunity_tags: insert by artist" on public.opportunity_tags;
create policy "opportunity_tags: insert by artist" on public.opportunity_tags
  for insert with check (
    source = 'explicit'
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.artist_profile_id = auth.uid()
    )
  );
