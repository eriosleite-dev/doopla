-- Doopla — Agenda operacional editável (Prioridade 7).
--
-- Substitui o modelo antigo `artist_availability` (só "disponível",
-- 1 dia, sem nota, só o próprio artista) por um modelo mais completo:
-- vários tipos de marcação, período (início/fim), nota livre, e quem
-- criou — pra permitir que um booker com representação ativa também
-- marque coisas na agenda do artista que representa (viagem,
-- indisponibilidade etc.), respeitando a relação.
--
-- `artist_availability` continua no banco (não migramos os dados —
-- produto ainda sem uso real em produção), só paramos de gravar nela.
--
-- Eventos de booking confirmado continuam vindo de `bookings`, sem
-- tabela própria — isso não muda.

create table public.agenda_entries (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles (id) on delete cascade,
  entry_type text not null check (entry_type in ('disponivel', 'indisponivel', 'viagem', 'outro')),
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint agenda_entries_date_order check (end_date >= start_date)
);

comment on table public.agenda_entries is 'Marcações manuais na agenda do artista (disponível/indisponível/viagem/outro), com período e nota livre. Pode ser criada pelo próprio artista ou por um booker com representation ativa — created_by_profile_id registra quem criou.';

alter table public.agenda_entries enable row level security;

create policy "agenda_entries: select own or represented" on public.agenda_entries
  for select using (
    auth.uid() = artist_profile_id
    or exists (
      select 1 from public.representations r
      where r.artist_profile_id = agenda_entries.artist_profile_id
        and r.booker_profile_id = auth.uid()
    )
  );

create policy "agenda_entries: insert own or represented" on public.agenda_entries
  for insert with check (
    created_by_profile_id = auth.uid()
    and (
      auth.uid() = artist_profile_id
      or exists (
        select 1 from public.representations r
        where r.artist_profile_id = agenda_entries.artist_profile_id
          and r.booker_profile_id = auth.uid()
      )
    )
  );

create policy "agenda_entries: delete own or represented" on public.agenda_entries
  for delete using (
    auth.uid() = artist_profile_id
    or exists (
      select 1 from public.representations r
      where r.artist_profile_id = agenda_entries.artist_profile_id
        and r.booker_profile_id = auth.uid()
    )
  );
