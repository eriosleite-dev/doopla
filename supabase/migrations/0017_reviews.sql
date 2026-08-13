-- Doopla — Perfis, reputação e avaliações (doopla-perfis-avaliacoes.md).
--
-- Avaliação nasce da relação real (booking concluído), nunca avaliação
-- livre. Quando um booking vira 'concluida', a Doopla cria automaticamente
-- as duas avaliações pendentes daquele booking (artista avalia booker,
-- booker avalia artista) — cada linha é o "slot" de uma avaliação, criado
-- vazio (rating null) e preenchido depois pelo autor.

create type public.review_status as enum (
  'pendente',
  'ativa',
  'removida',
  'invalidada'
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_profile_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  attributes text[] not null default '{}',
  comment text,
  status public.review_status not null default 'pendente',
  contested boolean not null default false,
  requested_at timestamptz,
  submitted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reviews_different_parties check (reviewer_profile_id <> reviewee_profile_id),
  constraint reviews_one_per_reviewer unique (booking_id, reviewer_profile_id)
);

comment on table public.reviews is 'Slot de avaliação por booking+autor. Criado pendente automaticamente na conclusão do booking; rating/attributes/comment só existem depois que o autor envia.';
comment on column public.reviews.status is 'pendente = ainda não enviada. ativa = enviada e conta pro agregado público. removida/invalidada = moderação da Doopla, nunca conta pra fora.';
comment on column public.reviews.requested_at is 'Marca que a contraparte clicou em "Pedir avaliação" pedindo pro autor desta linha enviar a dele. Só pode ser setado uma vez.';

create index reviews_reviewee_idx on public.reviews (reviewee_profile_id) where status = 'ativa';
create index reviews_booking_idx on public.reviews (booking_id);

alter table public.reviews enable row level security;

-- Quem participa do booking (como reviewer ou reviewee) sempre vê as próprias linhas,
-- pendentes ou não. O público em geral só vê avaliações já enviadas e não removidas.
create policy "reviews: select own" on public.reviews
  for select using (auth.uid() = reviewer_profile_id or auth.uid() = reviewee_profile_id);

create policy "reviews: select public active" on public.reviews
  for select using (status = 'ativa');

-- O autor preenche/edita a própria avaliação (rating, atributos, comentário).
-- A janela de 24h pra edição depois do envio é regra de produto, aplicada na
-- server action — RLS aqui só garante que ninguém mexe na avaliação alheia.
create policy "reviews: reviewer submits own" on public.reviews
  for update using (auth.uid() = reviewer_profile_id)
  with check (auth.uid() = reviewer_profile_id);

-- Quem foi avaliado pode pedir a avaliação (requested_at) e contestar
-- (contested) a própria linha recebida — nunca alterar rating/atributos/
-- comentário alheios; a server action restringe quais colunas cada ação
-- realmente altera.
create policy "reviews: reviewee requests or contests" on public.reviews
  for update using (auth.uid() = reviewee_profile_id)
  with check (auth.uid() = reviewee_profile_id);

-- Não existe policy de insert pra usuários autenticados: as duas linhas
-- (artista avalia booker, booker avalia artista) só nascem via trigger
-- (security definer) na conclusão do booking.
create or replace function public.create_pending_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    insert into public.reviews (booking_id, reviewer_profile_id, reviewee_profile_id)
    values
      (new.id, new.artist_profile_id, new.booker_profile_id),
      (new.id, new.booker_profile_id, new.artist_profile_id)
    on conflict (booking_id, reviewer_profile_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger create_pending_reviews_on_conclusion
  after update on public.bookings
  for each row execute function public.create_pending_reviews();
