-- Doopla — mural de oportunidades ("tenho um trabalho") + cachê nos bookings.
--
-- Um artista já tem (ou quase tem) um trabalho fechado e publica pra
-- qualquer booker ver e assumir a negociação/cobrança. Separado de
-- `bookings` porque não é 1 pra 1: fica aberto até algum booker aceitar
-- ou contrapropor, momento em que vira um booking de verdade.

alter table public.bookings
  add column cache_amount_cents integer;

comment on column public.bookings.cache_amount_cents is 'Cachê combinado, em centavos. Nulo = ainda não fechado.';

create type public.opportunity_status as enum ('aberta', 'preenchida', 'cancelada');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  cache_amount_cents integer,
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  status public.opportunity_status not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.opportunities.cache_amount_cents is 'Nulo = cachê ainda não fechado (mostra só a comissão em %).';

create trigger set_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

-- "Recusar" no mural é por booker, não fecha a oportunidade pros outros.
create table public.opportunity_dismissals (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  booker_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, booker_profile_id)
);

-- Contador do badge "não vistas" na aba Oportunidades.
alter table public.booker_profiles
  add column opportunities_seen_at timestamptz not null default '1970-01-01T00:00:00Z';

alter table public.opportunities enable row level security;
alter table public.opportunity_dismissals enable row level security;

-- Mural é público entre usuários autenticados (todo booker pode ver todas
-- as abertas); o artista dono sempre vê a própria, em qualquer status.
create policy "opportunities: select open or own" on public.opportunities
  for select using (status = 'aberta' or auth.uid() = artist_profile_id);
create policy "opportunities: insert own" on public.opportunities
  for insert with check (auth.uid() = artist_profile_id);
-- Regras finas de "quem pode mudar o quê" (ex: só descrição pelo dono,
-- só status por quem está reivindicando) ficam nas Server Actions, não
-- no banco — RLS aqui só garante que uma oportunidade já preenchida não
-- pode ser reivindicada de novo por outro booker.
create policy "opportunities: update by artist or claiming booker" on public.opportunities
  for update using (
    auth.uid() = artist_profile_id
    or (
      status = 'aberta'
      and exists (select 1 from public.booker_profiles bp where bp.profile_id = auth.uid())
    )
  );

create policy "opportunity_dismissals: select own" on public.opportunity_dismissals
  for select using (auth.uid() = booker_profile_id);
create policy "opportunity_dismissals: insert own" on public.opportunity_dismissals
  for insert with check (auth.uid() = booker_profile_id);
