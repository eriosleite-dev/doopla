-- Doopla — Dados de recebimento (adendo WhatsApp/concierge, item 14-18).
--
-- "Conta criada" ≠ "Doopla pronta pra operar": dados de recebimento
-- não são exigidos no cadastro, mas a Doopla não deve começar a
-- conduzir uma negociação real sem eles configurados. is_operationally_ready()
-- abaixo representa isso — nunca uma coluna denormalizada que pudesse
-- divergir da tabela real (mesma disciplina de fonte única já usada
-- em subscriptions.booker_plan: "toda checagem consulta o campo real,
-- nunca histórico").
--
-- Fonte única de verdade: painel e um futuro fluxo de WhatsApp
-- (ainda não implementado) escrevem pelo MESMO caminho —
-- set_payment_details() abaixo — nunca uma tabela paralela por canal.
--
-- Auditável por desenho, não por trigger separado: append-only
-- versionado (mesmo padrão de approval_records do Bloco 5) — toda
-- alteração INSERE uma linha nova e marca a anterior como superseded,
-- nunca UPDATE in-place. Isso já responde "quando foi alterado", "qual
-- está ativo" e "qual estava vigente em um instante T" sem tabela de
-- log separada.
--
-- Preparado pra expansão (outros meios/mercados) via method extensível
-- (hoje só 'pix'), sem forçar reescrita do schema depois.
--
-- Deliberadamente FORA do escopo desta migration: qualquer gatilho por
-- WhatsApp (ainda não existe canal de mensageria real) e qualquer
-- wiring com o Approval Engine/Post-model Policy Gate (Bloco 5 não é
-- tocado aqui) — is_operationally_ready() fica pronta pra ser
-- consultada por eles quando existirem, não é chamada por nada ainda.

create table public.payment_details (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  method text not null default 'pix' check (method in ('pix')),
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  pix_key text,
  holder_name text,
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete restrict,
  superseded_at timestamptz,

  check ((method <> 'pix') or (pix_key_type is not null and coalesce(trim(pix_key), '') <> '')),
  check ((status = 'active') = (superseded_at is null))
);

comment on table public.payment_details is 'Dados de recebimento do profissional — append-only versionado (nunca UPDATE in-place). Toda alteração insere uma linha nova e marca a anterior como superseded, dando auditoria (quando/quem/qual vigente em T) sem tabela de log separada. Escrita exclusiva via set_payment_details() seguranca definer — nunca INSERT/UPDATE direto por authenticated.';
comment on column public.payment_details.pix_key is 'Valor da chave Pix. PII sensível — RLS restringe leitura ao próprio dono; nunca exposta a conversation_messages/estruturas de IA (ver comentário do topo).';
comment on column public.payment_details.created_by is 'Quem originou esta versão — hoje sempre o próprio profissional (painel); preparado pra um futuro fluxo de WhatsApp que opere sobre a mesma fonte, sem exigir mudança de schema.';

-- Só uma linha 'active' por profissional — physical backstop além da
-- disciplina de supersede-then-insert da function abaixo.
create unique index payment_details_one_active_per_profile
  on public.payment_details (profile_id)
  where status = 'active';

create index payment_details_profile_history_idx
  on public.payment_details (profile_id, created_at desc);

alter table public.payment_details enable row level security;

create policy "payment_details: select own" on public.payment_details
  for select using (auth.uid() = profile_id);

-- Sem policy de insert/update/delete pra authenticated — toda escrita
-- passa por set_payment_details() (security definer), único caminho.

create function public.set_payment_details(
  p_method text,
  p_pix_key_type text,
  p_pix_key text,
  p_holder_name text
)
returns public.payment_details
language plpgsql
security definer set search_path = public
as $$
declare
  v_new public.payment_details;
begin
  if auth.uid() is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_method <> 'pix' then
    raise exception 'unsupported_method' using errcode = '22023';
  end if;
  if p_pix_key_type is null or coalesce(trim(p_pix_key), '') = '' then
    raise exception 'pix_key_required' using errcode = '22023';
  end if;

  update public.payment_details
  set status = 'superseded', superseded_at = now()
  where profile_id = auth.uid() and status = 'active';

  insert into public.payment_details (profile_id, method, pix_key_type, pix_key, holder_name, created_by)
  values (auth.uid(), p_method, p_pix_key_type, trim(p_pix_key), nullif(trim(p_holder_name), ''), auth.uid())
  returning * into v_new;

  return v_new;
end;
$$;

comment on function public.set_payment_details is 'Único caminho de escrita de payment_details — supersede a linha ativa anterior (se houver) e insere a nova, atomicamente. Painel e um futuro fluxo de WhatsApp chamam esta mesma function, nunca caminhos paralelos.';

revoke all on function public.set_payment_details from public;
grant execute on function public.set_payment_details to authenticated;

-- Prontidão operacional: "conta criada" (sempre true após cadastro) x
-- "Doopla pronta pra operar" (existe um método de recebimento ativo).
-- Nunca uma coluna denormalizada — sempre derivado da tabela real.
create function public.is_operationally_ready(p_profile_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.payment_details
    where profile_id = p_profile_id and status = 'active'
  );
$$;

comment on function public.is_operationally_ready is 'true quando o profissional tem dados de recebimento ativos configurados — "Doopla pronta pra operar", distinto de conta criada. Consultada pelo painel hoje; pronta pra ser consultada por um futuro Post-model Policy Gate antes de conduzir negociação real, sem acoplamento nenhum a este ponto.';

revoke all on function public.is_operationally_ready from public;
grant execute on function public.is_operationally_ready to authenticated;
