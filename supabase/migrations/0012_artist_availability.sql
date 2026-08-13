-- Doopla — Agenda do artista: disponibilidade marcada manualmente,
-- combinada com os trabalhos confirmados (que já têm bookings.event_date)
-- no calendário visual.

create table public.artist_availability (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  available_date date not null,
  created_at timestamptz not null default now(),
  unique (artist_profile_id, available_date)
);

alter table public.artist_availability enable row level security;

create policy "artist_availability: select own" on public.artist_availability
  for select using (auth.uid() = artist_profile_id);
create policy "artist_availability: insert own" on public.artist_availability
  for insert with check (auth.uid() = artist_profile_id);
create policy "artist_availability: delete own" on public.artist_availability
  for delete using (auth.uid() = artist_profile_id);
