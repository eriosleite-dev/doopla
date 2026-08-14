-- Doopla — Gerador de contrato por booking (doopla-gerador-contrato.md).
--
-- Só os módulos liberados agora: escopo, partes, evento. Os módulos de
-- forma de pagamento e política de cancelamento dependem do rascunho de
-- cancelamento/reembolso (aguardando validação Pagar.me/jurídico) — o
-- documento gerado deixa isso explícito em vez de fingir que a cláusula
-- existe.
--
-- `booking_contracts` é o snapshot imutável: uma vez gerado, o conteúdo
-- nunca muda, mesmo que o texto padrão dos módulos mude depois (mesma
-- regra-mãe de snapshot já usada no resto do produto). Sem policy de
-- update/delete de propósito.

alter table public.bookings
  add column client_name text,
  add column client_document text,
  add column event_location text;

comment on column public.bookings.client_name is 'Nome do contratante (cliente final) — precisa existir pro módulo "partes" do contrato.';
comment on column public.bookings.client_document is 'CPF/CNPJ do contratante, opcional.';
comment on column public.bookings.event_location is 'Local do evento — opcional, aparece como "A definir" se ausente no contrato.';

create table public.booking_contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  template_version text not null,
  generated_by_profile_id uuid not null references public.profiles (id),
  content jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.booking_contracts is 'Snapshot imutável do contrato gerado — content é o texto final das cláusulas no momento da geração, nunca recalculado a partir de config viva. booking_contract_url aponta pra cá, nunca pro template mestre.';
comment on column public.booking_contracts.content is 'jsonb com as cláusulas geradas (escopo, partes, evento) + lista do que ainda não está coberto (pagamento, cancelamento).';

create index booking_contracts_booking_idx on public.booking_contracts (booking_id);

alter table public.booking_contracts enable row level security;

create policy "booking_contracts: select related" on public.booking_contracts
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (auth.uid() = b.artist_profile_id or auth.uid() = b.booker_profile_id)
    )
  );

create policy "booking_contracts: insert related" on public.booking_contracts
  for insert with check (
    generated_by_profile_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (auth.uid() = b.artist_profile_id or auth.uid() = b.booker_profile_id)
    )
  );
