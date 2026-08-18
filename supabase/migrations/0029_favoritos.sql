-- Doopla — favoritar artista/booker, dos dois lados.
--
-- Totalmente separado de `representations` (histórico/relação profissional
-- confirmada) e de bookings concluídos. Favoritar é só uma lista salva,
-- sem nenhuma regra de negócio por trás — não afeta comissão, roteamento
-- de link ou qualquer outro fluxo.

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  favorited_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorited_user_id),
  constraint favorites_different_parties check (user_id <> favorited_user_id)
);

comment on table public.favorites is 'Lista de perfis favoritados por um usuário — sem relação com representations ou histórico de bookings.';

alter table public.favorites enable row level security;

create policy "favorites: select own" on public.favorites
  for select using (auth.uid() = user_id);
create policy "favorites: insert own" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites: delete own" on public.favorites
  for delete using (auth.uid() = user_id);
