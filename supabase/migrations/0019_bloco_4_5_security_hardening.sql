-- Doopla — Correções da auditoria de risco do Bloco 4.5, antes de
-- qualquer Server Action ser escrita em cima dessa camada.
--
-- Achados corrigidos aqui (ver PROGRESS.md / auditoria em anexo pro
-- detalhe de cada um):
--   1. profiles.is_admin podia ser auto-setado por qualquer usuário
--      (policy "profiles: update own" não tinha nenhuma restrição de
--      coluna) — escalação de privilégio completa.
--   2. select_booker_for_opportunity() autorizava o PRÓPRIO booker a se
--      selecionar, sem convite, interesse ou decisão do artista.
--   3. opportunity_events: insert por booker não validava nenhum vínculo
--      com a oportunidade — booker conseguia fabricar evento pra
--      qualquer oportunidade, mesmo sem relação nenhuma com ela.
--   4. opportunity_invitations: insert do artista não respeitava
--      distribution_mode (deveria exigir 'meus_bookers' ou 'ambos',
--      igual opportunity_interests já exige 'novos_bookers'/'ambos').
--   5. representation_requests: policy de resposta do artista não
--      travava as colunas de identidade (booker_profile_id,
--      artist_profile_id, message, expires_at) — um update malicioso
--      podia trocar QUEM está sendo aceito.
--   6. reviews (migration 0017, mesmo padrão): a policy do avaliado só
--      deveria liberar requested_at/contested, mas não travava as
--      outras colunas — o avaliado podia reescrever a própria nota.

-- =====================================================================
-- 1. profiles.is_admin: nunca setável pela própria sessão do usuário.
-- auth.uid() é nulo em conexões sem JWT (SQL Editor, service role,
-- migração) — só bloqueamos quando a mudança vem de uma sessão de
-- usuário autenticado via PostgREST.
-- =====================================================================

create or replace function public.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.is_admin is distinct from old.is_admin then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_admin_promotion
  before update on public.profiles
  for each row execute function public.prevent_self_admin_promotion();

-- =====================================================================
-- 2. select_booker_for_opportunity: só o artista dono da oportunidade
-- pode chamar. Antes, "auth.uid() = p_booker_profile_id" também
-- autorizava — ou seja, qualquer booker conseguia se auto-selecionar
-- direto pela função, pulando convite/interesse e a decisão do artista.
-- =====================================================================

create or replace function public.select_booker_for_opportunity(
  p_opportunity_id uuid,
  p_booker_profile_id uuid
)
returns public.opportunities
language plpgsql
security definer
set search_path = public
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

  if auth.uid() <> v_opportunity.artist_profile_id then
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

comment on function public.select_booker_for_opportunity is 'Único caminho pra preencher opportunities.selected_booker_id. Só o artista dono da oportunidade pode chamar (nunca o próprio booker). Levanta opportunity_already_filled (P0001) se outro booker já foi selecionado.';

-- =====================================================================
-- 3. opportunity_events: insert de booker exige vínculo real com a
-- oportunidade (convite ou interesse registrado), não só "sou algum
-- booker autenticado". Sem isso, dava pra fabricar histórico pra
-- qualquer oportunidade — dado que vira sinal pro Matching V2.
-- =====================================================================

drop policy "opportunity_events: insert by booker or admin" on public.opportunity_events;

create policy "opportunity_events: insert by involved booker or admin" on public.opportunity_events
  for insert with check (
    (
      auth.uid() = booker_profile_id
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
      )
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- =====================================================================
-- 4. opportunity_invitations: insert do artista respeita distribution_mode
-- (faltava — opportunity_interests já tinha o equivalente).
-- =====================================================================

drop policy "opportunity_invitations: insert by artist" on public.opportunity_invitations;

create policy "opportunity_invitations: insert by artist" on public.opportunity_invitations
  for insert with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.artist_profile_id = auth.uid()
        and o.distribution_mode in ('meus_bookers', 'ambos')
    )
  );

-- =====================================================================
-- 5. representation_requests: a resposta do artista (aceitar/recusar)
-- só pode mudar status/responded_at — nunca reatribuir a solicitação
-- pra outro booker/artista, reescrever a mensagem ou a validade.
-- =====================================================================

create or replace function public.pin_representation_request_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.booker_profile_id := old.booker_profile_id;
  new.artist_profile_id := old.artist_profile_id;
  new.message := old.message;
  new.expires_at := old.expires_at;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger representation_requests_pin_identity
  before update on public.representation_requests
  for each row execute function public.pin_representation_request_identity();

-- =====================================================================
-- 6. reviews (migration 0017): mesmo problema — a policy do avaliado
-- devia liberar só requested_at/contested, mas não travava o resto.
-- =====================================================================

create or replace function public.reviews_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.booking_id := old.booking_id;
  new.reviewer_profile_id := old.reviewer_profile_id;
  new.reviewee_profile_id := old.reviewee_profile_id;
  new.created_at := old.created_at;

  if auth.uid() = old.reviewee_profile_id then
    -- quem foi avaliado só mexe em requested_at e contested.
    new.rating := old.rating;
    new.attributes := old.attributes;
    new.comment := old.comment;
    new.status := old.status;
    new.submitted_at := old.submitted_at;
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

create trigger reviews_guard_columns_trigger
  before update on public.reviews
  for each row execute function public.reviews_guard_columns();
