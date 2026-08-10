-- Doopla — Bloco 4 (mínimo): negociação de comissão + status do booking.
--
-- Cobre o fluxo "booker propõe primeiro". O fluxo "artista encaminha um job
-- já fechado e propõe a comissão" usa a mesma tabela (por isso `proposed_by`
-- e a policy de insert aceitam os dois sentidos) — só falta construir as
-- actions/telas dele, quando chegar a vez.

create type public.booking_status as enum (
  'proposta_enviada',
  'aceita',
  'recusada',
  'aguardando_pagamento',
  'concluida'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.booking_status not null default 'proposta_enviada',
  proposed_by public.user_role not null,
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_different_parties check (artist_profile_id <> booker_profile_id)
);

comment on table public.bookings is 'Uma negociação de representação/booking entre um artista e um booker específicos.';
comment on column public.bookings.proposed_by is 'Quem iniciou a proposta: artista ou booker.';

create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- Histórico de status (proposta enviada, contraproposta, aceita, recusada...),
-- é o que alimenta o "histórico de status por booking" do roteiro.
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  commission_percent numeric(5,2),
  note text,
  created_at timestamptz not null default now()
);

comment on column public.booking_events.event_type is 'proposta_enviada | contraproposta | aceita | recusada | pagamento_confirmado | concluida';

alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

-- RLS: qualquer uma das duas partes do booking pode ver/atualizar.
-- Regras finas de "quem pode aceitar/recusar/contrapropor em cada estado"
-- ficam a cargo das Server Actions, não do banco — RLS aqui só garante que
-- ninguém acessa um booking do qual não faz parte.
create policy "bookings: select own" on public.bookings
  for select using (auth.uid() = artist_profile_id or auth.uid() = booker_profile_id);
create policy "bookings: insert own" on public.bookings
  for insert with check (auth.uid() = artist_profile_id or auth.uid() = booker_profile_id);
create policy "bookings: update own" on public.bookings
  for update using (auth.uid() = artist_profile_id or auth.uid() = booker_profile_id);

create policy "booking_events: select related" on public.booking_events
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.artist_profile_id = auth.uid() or b.booker_profile_id = auth.uid())
    )
  );
create policy "booking_events: insert related" on public.booking_events
  for insert with check (
    actor_profile_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.artist_profile_id = auth.uid() or b.booker_profile_id = auth.uid())
    )
  );
