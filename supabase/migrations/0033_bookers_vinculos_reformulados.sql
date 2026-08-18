-- Doopla — Bookers, convites, vínculos e Link de Orçamento (reformulação
-- estrutural). Três capacidades que faltavam:
--
--   1. representation_requests vira bidirecional (hoje só booker pedia pra
--      representar artista novo; agora artista também pode solicitar um
--      booker já cadastrado). A concorrência (as duas partes solicitando
--      quase ao mesmo tempo) precisa colapsar num único vínculo, de forma
--      atômica — mesmo princípio de lock já usado em
--      select_booker_for_opportunity (FOR UPDATE + recheck na transação).
--   2. Detecção de conta existente por contato (e-mail/telefone), pra
--      decidir entre "enviar solicitação" (já tem conta) e "enviar
--      convite" (ainda não tem) sem o usuário precisar saber de antemão.
--   3. Encerrar um vínculo (representations) — capacidade que hoje não
--      existe em lugar nenhum do banco. Precisa fechar convites diretos de
--      oportunidade ainda pendentes daquele par e limpar o roteamento do
--      Link de Orçamento se apontava pro booker desconectado.
--
-- =====================================================================
-- 1. representation_requests: quem solicitou, agora rastreado
-- =====================================================================

alter table public.representation_requests
  add column requested_by_profile_id uuid references public.profiles (id) on delete cascade;

-- Todo histórico existente foi solicitado pelo booker (única direção que
-- existia até aqui).
update public.representation_requests
  set requested_by_profile_id = booker_profile_id
  where requested_by_profile_id is null;

alter table public.representation_requests
  alter column requested_by_profile_id set not null,
  add constraint representation_requests_requested_by_is_party
    check (requested_by_profile_id in (booker_profile_id, artist_profile_id));

comment on column public.representation_requests.requested_by_profile_id is 'Quem iniciou: pode ser o booker (descoberta de artista novo) ou o artista (solicitando um booker já cadastrado). A outra parte é quem aceita/recusa.';

-- Limite de pendentes (representation_request_limit) é anti-spam pro
-- booker que sai descobrindo artistas novos — nunca deve contar
-- solicitação que o próprio artista iniciou em direção a um booker.
create or replace function public.enforce_representation_request_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit integer;
  v_pending_count integer;
begin
  if new.status <> 'pendente' or new.requested_by_profile_id <> new.booker_profile_id then
    return new;
  end if;

  select representation_request_limit into v_limit
  from public.booker_profiles
  where profile_id = new.booker_profile_id;

  select count(*) into v_pending_count
  from public.representation_requests
  where booker_profile_id = new.booker_profile_id
    and status = 'pendente'
    and expires_at > now();

  if v_pending_count >= coalesce(v_limit, 5) then
    raise exception 'representation_request_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Pin de identidade agora também trava requested_by_profile_id (senão um
-- update malicioso poderia reescrever quem foi o solicitante original).
create or replace function public.pin_representation_request_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.booker_profile_id := old.booker_profile_id;
  new.artist_profile_id := old.artist_profile_id;
  new.requested_by_profile_id := old.requested_by_profile_id;
  new.message := old.message;
  new.expires_at := old.expires_at;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Insert direto sai de cena: toda criação passa pela função atômica
-- request_representation_link (seção 2), que decide sozinha entre criar
-- uma solicitação nova ou colapsar numa pendente já existente do outro
-- lado. Responder (aceitar/recusar) uma solicitação já existente continua
-- podendo ser um update direto — aí não há corrida, é uma linha só.
drop policy if exists "representation_requests: insert own" on public.representation_requests;
drop policy if exists "representation_requests: artist responds" on public.representation_requests;

create policy "representation_requests: recipient responds" on public.representation_requests
  for update using (
    auth.uid() in (booker_profile_id, artist_profile_id)
    and auth.uid() <> requested_by_profile_id
  )
  with check (
    auth.uid() in (booker_profile_id, artist_profile_id)
    and auth.uid() <> requested_by_profile_id
  );

-- =====================================================================
-- 2. request_representation_link — solicitar/colapsar em aceite, atômico
-- =====================================================================

create or replace function public.request_representation_link(
  p_target_profile_id uuid,
  p_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role public.user_role;
  v_target_role public.user_role;
  v_artist_id uuid;
  v_booker_id uuid;
  v_existing public.representation_requests%rowtype;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_caller = p_target_profile_id then
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;

  select role into v_caller_role from public.profiles where id = v_caller;
  select role into v_target_role from public.profiles where id = p_target_profile_id;

  if v_caller_role is null or v_target_role is null or v_caller_role = v_target_role then
    raise exception 'invalid_target' using errcode = 'P0001';
  end if;

  if v_caller_role = 'artista' then
    v_artist_id := v_caller;
    v_booker_id := p_target_profile_id;
  else
    v_artist_id := p_target_profile_id;
    v_booker_id := v_caller;
  end if;

  if exists (
    select 1 from public.representations
    where artist_profile_id = v_artist_id and booker_profile_id = v_booker_id
  ) then
    raise exception 'already_connected' using errcode = 'P0001';
  end if;

  -- Lock da linha pendente (se existir) serializa contra a outra parte
  -- tentando o mesmo quase ao mesmo tempo — mesmo padrão de
  -- select_booker_for_opportunity.
  select * into v_existing
  from public.representation_requests
  where artist_profile_id = v_artist_id
    and booker_profile_id = v_booker_id
    and status = 'pendente'
  for update;

  if v_existing.id is not null then
    if v_existing.requested_by_profile_id = v_caller then
      raise exception 'request_already_pending' using errcode = 'P0001';
    end if;

    update public.representation_requests
    set status = 'aceita'
    where id = v_existing.id;

    return 'accepted';
  end if;

  insert into public.representation_requests (
    artist_profile_id, booker_profile_id, requested_by_profile_id, message
  ) values (
    v_artist_id, v_booker_id, v_caller, nullif(trim(coalesce(p_message, '')), '')
  );

  return 'requested';
end;
$$;

comment on function public.request_representation_link(uuid, text) is 'Ponto único de criação de representation_requests. Se já existir uma pendente iniciada pela outra parte, colapsa em aceite atômico em vez de tentar criar uma segunda linha (nunca duplica, nunca deixa duas pendentes divergentes pro mesmo par).';

grant execute on function public.request_representation_link(uuid, text) to authenticated;

-- =====================================================================
-- 3. find_representation_target_by_contact — detecção de conta existente
-- =====================================================================

create or replace function public.find_representation_target_by_contact(p_contact text)
returns table (
  profile_id uuid,
  role public.user_role,
  full_name text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_role public.user_role;
  v_target_role public.user_role;
  v_contact text := nullif(trim(p_contact), '');
  v_digits text;
begin
  if v_caller is null or v_contact is null then
    return;
  end if;

  select p.role into v_caller_role from public.profiles p where p.id = v_caller;
  if v_caller_role is null then
    return;
  end if;
  v_target_role := case when v_caller_role = 'artista' then 'booker' else 'artista' end;

  v_digits := regexp_replace(v_contact, '\D', '', 'g');

  return query
    select p.id, p.role, p.full_name, p.display_name, p.avatar_url
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.role = v_target_role
      and p.id <> v_caller
      and (
        (v_contact like '%@%' and lower(u.email) = lower(v_contact))
        or (length(v_digits) >= 8 and length(coalesce(p.phone, '')) > 0
            and regexp_replace(p.phone, '\D', '', 'g') = v_digits)
      )
    limit 1;
end;
$$;

comment on function public.find_representation_target_by_contact(text) is 'Usado pelo fluxo "Adicionar um Booker/Artista": dado nome+contato informado, descobre se já existe conta (do papel oposto ao de quem chama) pra decidir entre solicitação (conta existe) e convite (conta não existe) sem perguntar ao usuário.';

grant execute on function public.find_representation_target_by_contact(text) to authenticated;

-- =====================================================================
-- 4. terminate_representation — encerrar vínculo (não existia)
-- =====================================================================

create or replace function public.terminate_representation(p_representation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.representations%rowtype;
begin
  select * into v_rep from public.representations where id = p_representation_id for update;

  if v_rep.id is null then
    raise exception 'representation_not_found' using errcode = 'P0001';
  end if;
  if auth.uid() not in (v_rep.artist_profile_id, v_rep.booker_profile_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  -- Convite direto de oportunidade pendente cancela junto com o vínculo.
  -- Se já foi aceito, virou trabalho em curso — a regra própria de
  -- booking em andamento vale a partir daí, então não mexe.
  update public.opportunity_invitations oi
  set status = 'encerrada', responded_at = coalesce(oi.responded_at, now())
  from public.opportunities o
  where oi.opportunity_id = o.id
    and o.artist_profile_id = v_rep.artist_profile_id
    and oi.booker_profile_id = v_rep.booker_profile_id
    and oi.status = 'pendente';

  -- Roteamento do Link de Orçamento nunca pode continuar apontando pra um
  -- booker desconectado — cai pra "Você" (fallback seguro).
  update public.artist_link_routing
  set mode = 'eu', booker_id = null, updated_at = now()
  where artist_id = v_rep.artist_profile_id
    and booker_id = v_rep.booker_profile_id;

  -- Se esse booker era o artista ativo do slot Básico, libera o slot.
  update public.subscriptions
  set active_artist_profile_id = null
  where profile_id = v_rep.booker_profile_id
    and active_artist_profile_id = v_rep.artist_profile_id;

  delete from public.representations where id = p_representation_id;
end;
$$;

comment on function public.terminate_representation(uuid) is 'Único jeito de encerrar um vínculo — não existia nenhuma forma de fazer isso antes. Fecha convite direto de oportunidade pendente do par (preserva o que já foi aceito), zera roteamento do Link de Orçamento se apontava pra esse booker, libera slot do Básico se era o artista ativo.';

grant execute on function public.terminate_representation(uuid) to authenticated;
