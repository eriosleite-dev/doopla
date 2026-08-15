-- Doopla — Bloco C: Perfil completo + /orçamento (Especificação completa
-- final, Partes 1 e 2).
--
-- Reaproveita o que já existe (genres = estilos/especialidades do
-- artista, mercados = nichos, profiles.city/state/phone = localização/
-- contato) e só adiciona o que faltava de verdade.

alter table public.artist_profiles
  add column subcategory text,
  add column website_url text,
  add column other_links text,
  add column travels boolean not null default false,
  add column serves_other_locations boolean not null default false,
  add column accepts_out_of_city_work boolean not null default false,
  add column other_preferences text;

comment on column public.artist_profiles.travels is 'Preferência geral de atuação (Especificação Parte 2, 6.4) — nunca disponibilidade por data, isso é sempre derivado da Agenda.';

alter table public.booker_profiles
  add column professional_name text,
  add column bio text,
  add column specialties text,
  add column experience text,
  add column instagram_url text;

-- =====================================================================
-- /orçamento: roteamento configurado pelo artista dentro do Perfil.
-- =====================================================================

create type public.link_routing_mode as enum ('eu', 'meu_booker', 'eu_e_meu_booker');

create table public.artist_link_routing (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null unique references public.profiles (id) on delete cascade,
  mode public.link_routing_mode not null default 'eu',
  booker_id uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.artist_link_routing is 'Quem recebe as solicitações do link /orçamento do artista. Mudança vale só pra novas solicitações — oportunidades já nascidas mantêm assigned_to gravado no momento em que nasceram (nunca recalculado por config viva).';

create trigger set_updated_at before update on public.artist_link_routing
  for each row execute function public.set_updated_at();

alter table public.artist_link_routing enable row level security;

create policy "artist_link_routing: select own" on public.artist_link_routing
  for select using (auth.uid() = artist_id);
create policy "artist_link_routing: upsert own" on public.artist_link_routing
  for insert with check (auth.uid() = artist_id);
create policy "artist_link_routing: update own" on public.artist_link_routing
  for update using (auth.uid() = artist_id)
  with check (auth.uid() = artist_id and (
    mode = 'eu' or booker_id is null or exists (
      select 1 from public.representations r
      where r.artist_profile_id = auth.uid() and r.booker_profile_id = booker_id
    )
  ));

-- =====================================================================
-- opportunities: origem e atribuição das solicitações vindas do
-- /orçamento — colunas novas, nunca tocam no que já existe.
-- =====================================================================

alter table public.opportunities
  add column source text not null default 'mural' check (source in ('mural', 'artist_link')),
  add column assigned_to text check (assigned_to in ('artist', 'booker', 'shared')),
  add column client_name text,
  add column client_contact text,
  add column client_offered_cents integer,
  alter column commission_percent drop not null;

comment on column public.opportunities.commission_percent is 'Nulo = comissão do booker ainda não negociada (caso comum em solicitações vindas do /orçamento). Sempre preenchido em oportunidades publicadas manualmente (source = mural).';

comment on column public.opportunities.source is 'mural = artista publicou manualmente (Publicar trabalho). artist_link = cliente enviou pelo link /orçamento do artista.';
comment on column public.opportunities.assigned_to is 'Snapshot de quem foi endereçado no nascimento (nunca recalculado): artist (só o artista vê), booker (convite direto pro booker configurado), shared (os dois veem).';
comment on column public.opportunities.client_offered_cents is 'Valor que o cliente ofereceu no formulário público, distinto de cache_amount_cents (que é o valor efetivamente negociado/fechado).';

-- Resolve o roteamento e cria a oportunidade em nome do artista — função
-- de acesso público (o formulário /orçamento não exige login). Security
-- definer pra poder inserir em opportunities/opportunity_invitations
-- mesmo sem sessão autenticada, mesmo padrão já usado em handle_new_user.
create or replace function public.submit_orcamento_request(
  p_artist_slug text,
  p_description text,
  p_client_name text,
  p_client_contact text,
  p_event_date date,
  p_location text,
  p_offered_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
  v_public_enabled boolean;
  v_routing public.artist_link_routing;
  v_assigned_to text;
  v_opportunity_id uuid;
begin
  select p.id, ap.public_enabled into v_artist_id, v_public_enabled
  from public.profiles p
  join public.artist_profiles ap on ap.profile_id = p.id
  where p.slug = p_artist_slug;

  if v_artist_id is null or not coalesce(v_public_enabled, false) then
    raise exception 'artist_not_found' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_client_name), '') = '' then
    raise exception 'client_name_required' using errcode = 'P0001';
  end if;

  select * into v_routing from public.artist_link_routing where artist_id = v_artist_id;

  if v_routing is null or v_routing.mode = 'eu' then
    v_assigned_to := 'artist';
  elsif v_routing.mode = 'meu_booker' then
    v_assigned_to := 'booker';
  else
    v_assigned_to := 'shared';
  end if;

  insert into public.opportunities (
    artist_profile_id, description, commission_percent, distribution_mode,
    status, source, assigned_to, client_name, client_contact, event_date,
    location, client_offered_cents
  ) values (
    v_artist_id, coalesce(nullif(trim(p_description), ''), 'Solicitação recebida pelo link de orçamento'),
    null, 'meus_bookers', 'aberta', 'artist_link', v_assigned_to, p_client_name, p_client_contact,
    p_event_date, p_location, p_offered_cents
  )
  returning id into v_opportunity_id;

  if v_assigned_to in ('booker', 'shared') and v_routing.booker_id is not null then
    insert into public.opportunity_invitations (opportunity_id, booker_profile_id)
    values (v_opportunity_id, v_routing.booker_id)
    on conflict (opportunity_id, booker_profile_id) do nothing;
  end if;

  return v_opportunity_id;
end;
$$;

comment on function public.submit_orcamento_request is 'Único caminho público de criação de oportunidade a partir do link /orçamento. commission_percent nasce em 0 (ainda não negociada) — distinto de client_offered_cents, que é só o valor que o cliente propôs.';
