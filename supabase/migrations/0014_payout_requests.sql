-- Doopla — Bloco G item 3: saldo disponível + botão Sacar, só a interface
-- e o fluxo de solicitação. A transferência de verdade (Pagar.me) é
-- Bloco 2, ainda não começou — por isso essa tabela só registra o pedido,
-- nunca processa nada.

create type public.payout_request_status as enum ('solicitado');

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status public.payout_request_status not null default 'solicitado',
  created_at timestamptz not null default now()
);

comment on table public.payout_requests is 'Pedido de saque. Sem processamento real ainda — só registra a solicitação (Bloco 2/Pagar.me faz a transferência de verdade).';

alter table public.payout_requests enable row level security;

create policy "payout_requests: select own" on public.payout_requests
  for select using (auth.uid() = profile_id);
create policy "payout_requests: insert own" on public.payout_requests
  for insert with check (auth.uid() = profile_id);
