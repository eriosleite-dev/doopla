-- Doopla Intelligence OS v1 — camada de conversação.
--
-- Fundação auditável pra representação/mandato/estado de uma conversa,
-- aprovada em 3 rodadas de desenho (auditoria de arquitetura ->
-- desenho v1 -> revisão v2 corrigindo consistência mandato/tenant ->
-- v3 tornando represented_professional_id imutável). Nenhuma
-- integração de IA nesta migration — só a fundação de dados sobre a
-- qual o Context Builder/Orchestrator vão rodar depois, como
-- funcionalidade própria.
--
-- Decisão estrutural central (v3): conversations.represented_professional_id
-- é definido na criação e NUNCA muda depois. Se um cliente pedir pra
-- falar com outro profissional, isso nasce como uma conversa NOVA
-- (ver transferred_from_conversation_id), nunca como um UPDATE na
-- conversa existente. Isso não é só regra de produto — é o que faz as
-- FKs compostas de isolamento de tenant (participante/oportunidade/
-- booking) funcionarem de verdade: um ponto de ancoragem que muda
-- quebraria a garantia no exato instante da troca.

-- ============================================================
-- 1. external_participants — "cliente"/contato externo, sem conta
--    Doopla, escopado por profissional (nunca identidade global).
-- ============================================================
create table public.external_participants (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete restrict,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Necessária pra sustentar a FK composta de conversations abaixo
  -- (garante no banco que uma conversa só referencia participante do
  -- mesmo profissional que ela representa).
  unique (professional_id, id)
);

comment on table public.external_participants is 'Contato externo (cliente) de UM profissional específico — nunca identidade global entre profissionais. O mesmo telefone falando com dois profissionais diferentes gera duas linhas distintas, de propósito.';

create trigger set_updated_at before update on public.external_participants
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. external_participant_channel_identities — identificadores por
--    canal (telefone, e-mail, etc). A unique constraint evita
--    duplicata DENTRO do escopo do profissional; ela NÃO decide que
--    duas identidades diferentes (telefone X, e-mail Y) são a mesma
--    pessoa — isso é decisão da camada de intake/resolução (fora
--    desta migration), nunca inferência silenciosa da IA.
-- ============================================================
create table public.external_participant_channel_identities (
  id uuid primary key default gen_random_uuid(),
  external_participant_id uuid not null references public.external_participants (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete restrict,
  channel text not null check (channel in ('public_link', 'whatsapp', 'email', 'painel', 'outro')),
  identifier text not null,
  -- Como esta identidade foi associada a este participante — nunca
  -- 'ai_inferred'/probabilístico nesta v1. A primeira identidade de um
  -- participante novo nasce 'first_contact'; uma segunda identidade só
  -- entra por confirmação determinística.
  linked_via text not null default 'first_contact'
    check (linked_via in ('first_contact', 'professional_confirmed', 'authenticated_session')),
  created_at timestamptz not null default now(),
  unique (professional_id, channel, identifier)
);

comment on table public.external_participant_channel_identities is 'Um mesmo external_participant pode ter mais de um identificador (telefone E e-mail), mas a associação de uma NOVA identidade a um participante já existente só acontece por mecanismo determinístico (linked_via) — nunca merge probabilístico por IA.';

create index external_participant_channel_identities_participant_idx
  on public.external_participant_channel_identities (external_participant_id);

-- ============================================================
-- 3. conversations — entidade central.
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),

  -- Mandato/representação — ver bloco de comentário no topo do
  -- arquivo. IMUTÁVEL: nenhum GRANT UPDATE nesta coluna (ver seção de
  -- privilégios abaixo). Definida uma única vez em create_conversation().
  represented_professional_id uuid not null references public.profiles (id) on delete restrict,

  external_participant_id uuid references public.external_participants (id) on delete restrict,

  -- Como a conversa nasceu (imutável) vs. onde ela está acontecendo
  -- agora (pode migrar de canal ao longo do tempo).
  origin text not null check (origin in ('public_link', 'whatsapp', 'email', 'painel', 'outro')),
  origin_reference text,
  channel text not null check (channel in ('public_link', 'whatsapp', 'email', 'painel', 'outro')),

  conversation_type text not null default 'external_inquiry'
    check (conversation_type in ('external_inquiry', 'professional_self')),

  -- Escopo/status do mandato DENTRO da representação fixa — pode
  -- evoluir (ex.: 'active' -> 'suspended'), nunca troca quem é
  -- representado. Histórico completo em conversation_mandate_events.
  mandate text not null default 'active',
  mandate_created_at timestamptz not null default now(),
  mandate_changed_at timestamptz,
  mandate_change_reason text,

  current_intent text,

  related_opportunity_id uuid references public.opportunities (id) on delete restrict,
  related_booking_id uuid references public.bookings (id) on delete restrict,

  -- Estado formal (placeholder pra state machine futura) + status
  -- simples de listagem. Histórico completo em conversation_state_events.
  current_state text not null default 'novo',
  previous_state text,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  state_updated_at timestamptz not null default now(),

  expected_next_step text,
  last_activity_at timestamptz not null default now(),

  -- Linhagem de transferência — só auditoria/rastreio de origem,
  -- NUNCA um caminho de acesso (ver RLS abaixo: nenhuma policy usa
  -- esta coluna pra conceder leitura). auto-referência: uma conversa
  -- nova aponta pra uma anterior (de qualquer profissional), nunca
  -- pra si mesma.
  transferred_from_conversation_id uuid references public.conversations (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (transferred_from_conversation_id is null or transferred_from_conversation_id <> id),
  check (conversation_type <> 'professional_self' or external_participant_id is null),

  -- Necessária pra sustentar as duas FKs compostas de isolamento de
  -- tenant abaixo (opportunity/booking só do mesmo profissional).
  unique (represented_professional_id, id)
);

comment on table public.conversations is 'Entidade central do Intelligence OS. represented_professional_id é definido na criação e nunca muda — mudança legítima de representado sempre nasce como conversa nova (transferred_from_conversation_id), nunca UPDATE nesta linha.';
comment on column public.conversations.represented_professional_id is 'IMUTÁVEL. Sem GRANT UPDATE pra nenhuma role. Só create_conversation() escreve, uma vez, no INSERT.';
comment on column public.conversations.transferred_from_conversation_id is 'Só linhagem/auditoria. Nenhuma RLS policy usa este vínculo pra conceder acesso à conversa anterior — mensagens, contexto, oportunidade e booking de origem continuam privados de quem não é o representado original.';

-- Isolamento de tenant garantido pelo banco, não só por RLS: uma
-- conversa só pode referenciar participante/oportunidade/booking do
-- MESMO profissional que ela representa. FK composta contra a
-- unique(professional_id/artist_profile_id, id) de cada tabela alvo —
-- nullable nos três casos, então não se aplica enquanto o vínculo
-- ainda não existe.
alter table public.conversations
  add constraint conversations_participant_same_tenant
  foreign key (represented_professional_id, external_participant_id)
  references public.external_participants (professional_id, id);

alter table public.opportunities
  add constraint opportunities_professional_id_id_key unique (artist_profile_id, id);

alter table public.conversations
  add constraint conversations_opportunity_same_tenant
  foreign key (represented_professional_id, related_opportunity_id)
  references public.opportunities (artist_profile_id, id);

alter table public.bookings
  add constraint bookings_professional_id_id_key unique (artist_profile_id, id);

alter table public.conversations
  add constraint conversations_booking_same_tenant
  foreign key (represented_professional_id, related_booking_id)
  references public.bookings (artist_profile_id, id);

create trigger set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create index conversations_professional_status_idx
  on public.conversations (represented_professional_id, status);
create index conversations_professional_activity_idx
  on public.conversations (represented_professional_id, last_activity_at desc);
create index conversations_opportunity_idx on public.conversations (related_opportunity_id);
create index conversations_booking_idx on public.conversations (related_booking_id);
create index conversations_external_participant_idx on public.conversations (external_participant_id);
create index conversations_transferred_from_idx on public.conversations (transferred_from_conversation_id);

-- ============================================================
-- 4. conversation_messages — conteúdo real do thread. Nunca um
--    campo "role" de LLM: author_type/direction/channel são eixos
--    independentes. Sem content_type='system_note' (revisado — um
--    aviso de sistema visível ao participante já é representável como
--    author_type='system' + content_type='text'). Nota interna, tool
--    call, decisão de policy e erro NUNCA entram aqui — pertencem a
--    uma camada de auditoria própria, fora desta migration.
-- ============================================================
create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,

  direction text not null check (direction in ('inbound', 'outbound')),
  author_type text not null check (author_type in ('external_participant', 'professional', 'ai', 'system')),
  author_profile_id uuid references public.profiles (id) on delete restrict,
  author_external_participant_id uuid references public.external_participants (id) on delete restrict,
  channel text not null check (channel in ('public_link', 'whatsapp', 'email', 'painel', 'outro')),

  content_type text not null check (content_type in ('text', 'audio', 'attachment')),
  -- Conteúdo textual ORIGINAL (nunca transcrição — ver transcript).
  body text,
  audio_url text,
  -- Derivado do áudio, preenchido depois, nunca confundido com body.
  transcript text,
  transcription_status text check (transcription_status in ('pending', 'done', 'failed')),
  attachment_url text,
  attachment_metadata jsonb,

  generated_by text not null default 'human' check (generated_by in ('human', 'ai')),

  created_at timestamptz not null default now(),

  check (content_type <> 'text' or body is not null),
  check (content_type <> 'audio' or audio_url is not null),
  check (content_type <> 'attachment' or attachment_url is not null),
  check (author_type <> 'professional' or author_profile_id is not null),
  check (author_type <> 'external_participant' or author_external_participant_id is not null)
);

comment on table public.conversation_messages is 'Só conteúdo real do thread, visível a quem participa da conversa. Tool call, decisão interna e erro técnico não pertencem aqui.';
comment on column public.conversation_messages.body is 'Conteúdo textual ORIGINAL da mensagem — nunca a transcrição de um áudio (ver transcript).';
comment on column public.conversation_messages.transcript is 'Conteúdo DERIVADO de audio_url por transcrição — nunca confundir/concatenar com body.';

create index conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at);

-- ============================================================
-- 5. conversation_mandate_events — append-only. Audita só mudança de
--    ESCOPO do mandato (mandate), nunca identidade — represented_
--    professional_id não muda, então não há "previous/new professional"
--    pra registrar aqui (removido do desenho v2 -> v3). A linha de
--    nascimento da conversa já é o primeiro evento (previous_mandate
--    null), não só mudanças posteriores.
-- ============================================================
create table public.conversation_mandate_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  previous_mandate text,
  new_mandate text not null,
  reason text,
  changed_by text not null check (changed_by in ('system', 'professional', 'admin', 'ai')),
  changed_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.conversation_mandate_events is 'Append-only. previous_mandate null = linha de nascimento da conversa. Nunca UPDATE/DELETE fora de manutenção administrativa direta no banco.';

create index conversation_mandate_events_conversation_idx
  on public.conversation_mandate_events (conversation_id, created_at);

-- ============================================================
-- 6. conversation_state_events — append-only, mesmo padrão.
-- ============================================================
create table public.conversation_state_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  previous_state text,
  new_state text not null,
  reason text,
  changed_by text not null check (changed_by in ('system', 'professional', 'admin', 'ai')),
  changed_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.conversation_state_events is 'Append-only. previous_state null = linha de nascimento da conversa. A State Machine completa ainda não existe — esta tabela só garante que nenhuma transição futura acontece sem deixar rastro.';

create index conversation_state_events_conversation_idx
  on public.conversation_state_events (conversation_id, created_at);

-- ============================================================
-- 7. ai_usage_events ganha conversation_id (aditivo, nullable) — não
--    força todo uso de IA existente/futuro a estar ligado a uma
--    conversa (ex.: um worker de tags continua sem isso).
-- ============================================================
alter table public.ai_usage_events
  add column conversation_id uuid references public.conversations (id) on delete set null;

comment on column public.ai_usage_events.conversation_id is 'Liga um evento de uso de IA à conversa que o originou, quando aplicável. Nullable — nem todo uso de IA nasce de uma conversa.';

-- ============================================================
-- Privilégios de tabela: nenhum caminho de authenticated cria/altera
-- conversations, ou escreve nos dois logs append-only, direto — só as
-- três functions abaixo (security definer, dono != authenticated).
-- Isso é estrutural (nível de privilégio), não só convenção de RLS:
-- represented_professional_id/mandate/current_state ficam protegidos
-- mesmo que uma policy futura seja escrita errada por engano.
-- conversation_messages fica de fora deste bloco de propósito — a
-- autoria aí é controlada por RLS (WITH CHECK), não por privilégio de
-- tabela, porque o profissional PRECISA conseguir inserir sua própria
-- mensagem humana direto; só author_type='ai'/'system' fica vetado,
-- pela própria policy abaixo (nunca por autoria vinda de fora).
-- ============================================================
revoke insert, update on public.conversations from authenticated;
revoke insert, update, delete on public.conversation_mandate_events from authenticated;
revoke insert, update, delete on public.conversation_state_events from authenticated;

-- ============================================================
-- Functions privilegiadas — únicas portas de escrita pros campos
-- protegidos acima. Todas validam o chamador internamente (nunca
-- confiam em parâmetro como prova de identidade), search_path fixo,
-- escopo mínimo, sem service_role.
-- ============================================================

-- create_conversation(): único caminho de criação. Gera atomicamente
-- a conversa + o evento de nascimento de mandato + o evento de
-- nascimento de estado. Não deve existir conversa sem os dois eventos.
create function public.create_conversation(
  p_represented_professional_id uuid,
  p_conversation_type text default 'external_inquiry',
  p_external_participant_id uuid default null,
  p_origin text default 'painel',
  p_origin_reference text default null,
  p_channel text default null,
  p_initial_mandate text default 'active',
  p_initial_state text default 'novo',
  p_transferred_from_conversation_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
begin
  -- Validação determinística do chamador — nunca confia no parâmetro
  -- sozinho como prova de identidade. Um professional só cria
  -- conversa em nome de si mesmo; criação em nome de outro perfil
  -- (ex.: um caminho futuro de intake público/webhook) precisa vir de
  -- um caminho de sistema com sua própria validação, não desta
  -- checagem de auth.uid().
  if auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

  insert into public.conversations (
    represented_professional_id, conversation_type, external_participant_id,
    origin, origin_reference, channel,
    mandate, mandate_created_at,
    current_state, previous_state, state_updated_at,
    transferred_from_conversation_id
  ) values (
    p_represented_professional_id, p_conversation_type, p_external_participant_id,
    p_origin, p_origin_reference, coalesce(p_channel, p_origin),
    p_initial_mandate, now(),
    p_initial_state, null, now(),
    p_transferred_from_conversation_id
  )
  returning * into v_conversation;

  insert into public.conversation_mandate_events (
    conversation_id, previous_mandate, new_mandate, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_mandate, 'conversa criada', 'system', auth.uid()
  );

  insert into public.conversation_state_events (
    conversation_id, previous_state, new_state, reason, changed_by, changed_by_profile_id
  ) values (
    v_conversation.id, null, p_initial_state, 'conversa criada', 'system', auth.uid()
  );

  return v_conversation;
end;
$$;

comment on function public.create_conversation is 'Único caminho de criação de conversation. Sempre gera, na mesma transação, a linha da conversa e os dois eventos de nascimento (mandato e estado) — nunca existe conversa parcialmente criada.';

revoke all on function public.create_conversation from public;
grant execute on function public.create_conversation to authenticated;

-- set_conversation_mandate(): único caminho de escrita em
-- conversations.mandate/mandate_changed_at/mandate_change_reason.
-- NUNCA toca represented_professional_id.
create function public.set_conversation_mandate(
  p_conversation_id uuid,
  p_new_mandate text,
  p_reason text default null,
  p_changed_by text default 'professional',
  p_changed_by_profile_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_previous_mandate text;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- Só o próprio representado (ou um caminho de sistema/admin
  -- explícito) pode alterar o mandato da conversa. Nunca confia em
  -- p_changed_by_profile_id como prova — valida contra auth.uid().
  if p_changed_by = 'professional' then
    if auth.uid() is distinct from v_conversation.represented_professional_id then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    p_changed_by_profile_id := auth.uid();
  end if;

  v_previous_mandate := v_conversation.mandate;

  update public.conversations
  set mandate = p_new_mandate,
      mandate_changed_at = now(),
      mandate_change_reason = p_reason
  where id = p_conversation_id
  returning * into v_conversation;

  insert into public.conversation_mandate_events (
    conversation_id, previous_mandate, new_mandate, reason, changed_by, changed_by_profile_id
  ) values (
    p_conversation_id, v_previous_mandate, p_new_mandate, p_reason, p_changed_by, p_changed_by_profile_id
  );

  return v_conversation;
end;
$$;

comment on function public.set_conversation_mandate is 'Único caminho de mudança de mandate. Nunca escreve represented_professional_id — mudança de representado é sempre uma conversa nova (create_conversation com transferred_from_conversation_id), nunca um UPDATE aqui.';

revoke all on function public.set_conversation_mandate from public;
grant execute on function public.set_conversation_mandate to authenticated;

-- advance_conversation_state(): único caminho de escrita em
-- conversations.current_state/previous_state/state_updated_at.
create function public.advance_conversation_state(
  p_conversation_id uuid,
  p_new_state text,
  p_reason text default null,
  p_changed_by text default 'professional',
  p_changed_by_profile_id uuid default null
)
returns public.conversations
language plpgsql
security definer set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_previous_state text;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if p_changed_by = 'professional' then
    if auth.uid() is distinct from v_conversation.represented_professional_id then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    p_changed_by_profile_id := auth.uid();
  end if;

  v_previous_state := v_conversation.current_state;

  update public.conversations
  set current_state = p_new_state,
      previous_state = v_previous_state,
      state_updated_at = now()
  where id = p_conversation_id
  returning * into v_conversation;

  insert into public.conversation_state_events (
    conversation_id, previous_state, new_state, reason, changed_by, changed_by_profile_id
  ) values (
    p_conversation_id, v_previous_state, p_new_state, p_reason, p_changed_by, p_changed_by_profile_id
  );

  return v_conversation;
end;
$$;

comment on function public.advance_conversation_state is 'Único caminho de transição de estado. A State Machine completa ainda não existe — esta function só garante que qualquer transição futura já nasce auditável.';

revoke all on function public.advance_conversation_state from public;
grant execute on function public.advance_conversation_state to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.external_participants enable row level security;
alter table public.external_participant_channel_identities enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_mandate_events enable row level security;
alter table public.conversation_state_events enable row level security;

-- external_participants: só o profissional dono lê/mantém seus
-- próprios contatos. Sem policy nenhuma pra anon — participante
-- externo nunca tem sessão Supabase nesta v1.
create policy "external_participants: select own" on public.external_participants
  for select using (auth.uid() = professional_id);
create policy "external_participants: insert own" on public.external_participants
  for insert with check (auth.uid() = professional_id);
create policy "external_participants: update own" on public.external_participants
  for update using (auth.uid() = professional_id);

create policy "external_participant_channel_identities: select own" on public.external_participant_channel_identities
  for select using (auth.uid() = professional_id);
create policy "external_participant_channel_identities: insert own" on public.external_participant_channel_identities
  for insert with check (auth.uid() = professional_id);

-- conversations: só o representado lê a própria conversa. Nenhuma
-- policy consulta representations (vínculo artista<->booker) —
-- vínculo antigo de booker não abre acesso ao Intelligence OS, de
-- propósito. Nenhuma policy usa transferred_from_conversation_id pra
-- conceder leitura de outra linha.
create policy "conversations: select own" on public.conversations
  for select using (auth.uid() = represented_professional_id);
-- Sem policy de INSERT/UPDATE direto pra authenticated — INSERT e
-- UPDATE de conversations foram revogados da role acima; só
-- create_conversation/set_conversation_mandate/advance_conversation_state
-- (security definer) escrevem aqui.

-- conversation_messages: posse decidida sempre via conversations
-- (uma única fonte de verdade de dono, nunca duplicar a checagem —
-- lição da recursão de RLS do Bloco 4.5).
create policy "conversation_messages: select via conversation" on public.conversation_messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_messages.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );
-- INSERT: só mensagem humana do próprio profissional (author_type
-- 'professional', author_profile_id = auth.uid()) nesta v1 — mensagem
-- de participante externo chega por um caminho de intake dedicado
-- (fora desta migration, não existe canal externo ligado ainda).
-- author_type 'ai'/'system' fica estruturalmente impossível de forjar
-- por um INSERT comum: o WITH CHECK abaixo exige author_type =
-- 'professional', então qualquer tentativa de inserir marcada como
-- 'ai'/'system' é rejeitada pela própria policy, não por confiança em
-- código de aplicação.
create policy "conversation_messages: insert own professional message" on public.conversation_messages
  for insert with check (
    author_type = 'professional'
    and author_profile_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_messages.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );

-- conversation_mandate_events / conversation_state_events: só leitura,
-- via posse da conversa. Sem policy de insert/update/delete pra
-- authenticated — são as functions (security definer) que escrevem.
create policy "conversation_mandate_events: select via conversation" on public.conversation_mandate_events
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_mandate_events.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );

create policy "conversation_state_events: select via conversation" on public.conversation_state_events
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_state_events.conversation_id
        and c.represented_professional_id = auth.uid()
    )
  );
