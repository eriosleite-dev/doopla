-- Doopla Intelligence OS v1 — Conversas Bloco 2: proveniência factual
-- draft -> resposta enviada.
--
-- Decisão do usuário (não uma escolha de implementação): quando
-- submitProfessionalReply() processa uma resposta que carrega um
-- outbound_intent_id, o boundary já possui evidência determinística do
-- que ocorreu NAQUELE momento — não é aceitável depender só de uma
-- recomputação futura de outbound_intents.content x
-- conversation_messages.body (o draft pode nunca mais ser lido de
-- volta com o mesmo valor; a comparação correta é a de agora). Por
-- isso persistimos, no INSERT da própria mensagem:
--   - replied_to_outbound_intent_id: qual draft esta mensagem responde
--     (nulo quando não há draft nenhum envolvido, ex.: profissional
--     iniciando um assunto novo, não respondendo a um "Precisa de
--     você").
--   - prepared_response_outcome: fato OBSERVADO da comparação
--     determinística draft x conteúdo submetido — 'sent' quando
--     tecnicamente idêntico (após normalização mínima, ver
--     normalize_prepared_response_text abaixo), 'edited' quando
--     diferente. NUNCA um Intervention Moment, NUNCA classifica
--     probable_reason, NUNCA significa approval/satisfação/takeover —
--     é só proveniência factual pra Learning/Beta Instrumentation
--     futuro (achado explícito do usuário, registrado em DECISOES.md).
--
-- Comparação client-side (se existir) é só UX — esta é a única fonte
-- autoritativa, calculada aqui dentro, no mesmo INSERT que persiste a
-- mensagem, nunca recomputada depois por um job separado.

-- ============================================================
-- 1. normalize_prepared_response_text — normalização MÍNIMA e
--    documentada: só diferenças TÉCNICAS (line endings CRLF/CR -> LF,
--    espaço/quebra de linha nas BORDAS). Explicitamente NUNCA:
--    comparação semântica, lowercase, remoção de pontuação,
--    equivalência via IA/modelo. Um espaço a mais NO MEIO do texto, ou
--    qualquer mudança de palavra/preço/número, permanece 'edited'.
-- ============================================================
create or replace function public.normalize_prepared_response_text(p_text text)
returns text
language sql
immutable
as $$
  select trim(both E' \t\n\r' from regexp_replace(coalesce(p_text, ''), E'\r\n|\r', E'\n', 'g'));
$$;

comment on function public.normalize_prepared_response_text is 'Conversas Bloco 2 — normalização MÍNIMA pra comparação draft x resposta enviada: apenas line endings (CRLF/CR->LF) e espaço/quebra de linha nas bordas. Nunca semântica (sem lowercase, sem remoção de pontuação, sem IA) — decisão explícita do usuário, qualquer diferença além disto é sempre "edited".';

revoke all on function public.normalize_prepared_response_text from public;
grant execute on function public.normalize_prepared_response_text to authenticated, service_role;
revoke execute on function public.normalize_prepared_response_text from anon;

-- ============================================================
-- 2. Colunas novas em conversation_messages — nulas pra 100% das
--    mensagens fora deste caminho (a esmagadora maioria: mensagens de
--    external_participant, mensagens do profissional que não
--    respondem a draft nenhum). replied_to_outbound_intent_id só
--    aponta pra um outbound_intent (nunca cria linha nova) — a mesma
--    referência 1:1 por FK já estabelecida pra origin_intake_id
--    (0063), nunca inferência por conteúdo/timestamp.
-- ============================================================
alter table public.conversation_messages
  add column replied_to_outbound_intent_id uuid references public.outbound_intents (id) on delete restrict;

alter table public.conversation_messages
  add column prepared_response_outcome text check (prepared_response_outcome in ('sent', 'edited'));

alter table public.conversation_messages
  add constraint conversation_messages_prepared_response_outcome_pairing
  check ((replied_to_outbound_intent_id is null) = (prepared_response_outcome is null));

alter table public.conversation_messages
  add constraint conversation_messages_replied_to_outbound_intent_prof_only
  check (replied_to_outbound_intent_id is null or author_type = 'professional');

comment on column public.conversation_messages.replied_to_outbound_intent_id is 'Conversas Bloco 2 — qual outbound_intent (draft já autorizado pelo Post-model Gate) esta mensagem do profissional responde. Nulo quando a mensagem não responde a draft nenhum. Escrito só por persist_inbound_message, no mesmo INSERT, nunca recomputado depois.';
comment on column public.conversation_messages.prepared_response_outcome is 'Conversas Bloco 2 — fato OBSERVADO (comparação determinística, normalize_prepared_response_text) entre outbound_intents.content e esta mensagem, no momento do envio: ''sent'' (tecnicamente idêntico) ou ''edited'' (diferente). NUNCA Intervention Moment, NUNCA probable_reason, NUNCA approval/satisfação/takeover — só proveniência factual.';

create index conversation_messages_replied_to_outbound_intent_idx
  on public.conversation_messages (replied_to_outbound_intent_id)
  where replied_to_outbound_intent_id is not null;

-- ============================================================
-- 3. persist_inbound_message — extensão ADITIVA:
--    p_replied_to_outbound_intent_id opcional (default null), mesmo
--    padrão já usado por p_origin_intake_id (0062). DROP explícito da
--    assinatura atual primeiro — CREATE OR REPLACE não substitui
--    quando a lista de parâmetros muda (achado real, já documentado em
--    0062).
-- ============================================================
drop function if exists public.persist_inbound_message(uuid, text, uuid, uuid, text, text, text, uuid);

create function public.persist_inbound_message(
  p_conversation_id uuid,
  p_author_type text,
  p_author_profile_id uuid,
  p_author_external_participant_id uuid,
  p_channel text,
  p_content_type text,
  p_body text,
  p_origin_intake_id uuid default null,
  p_replied_to_outbound_intent_id uuid default null
)
returns public.conversation_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_conv public.conversations;
  v_message public.conversation_messages;
  v_outbound public.outbound_intents;
  v_prepared_response_outcome text;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_author_type not in ('external_participant', 'professional') then
    raise exception 'invalid_author_type' using errcode = '22023';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if p_author_type = 'professional' and p_author_profile_id is distinct from v_conv.represented_professional_id then
    raise exception 'author_mismatch' using errcode = '22023';
  end if;
  if p_author_type = 'external_participant' and v_conv.external_participant_id is not null
     and p_author_external_participant_id is distinct from v_conv.external_participant_id then
    raise exception 'author_mismatch' using errcode = '22023';
  end if;

  if p_replied_to_outbound_intent_id is not null then
    if p_author_type <> 'professional' then
      raise exception 'replied_to_outbound_intent_requires_professional_author' using errcode = '22023';
    end if;

    select * into v_outbound from public.outbound_intents where id = p_replied_to_outbound_intent_id;
    if v_outbound is null then
      raise exception 'outbound_intent_not_found' using errcode = 'P0002';
    end if;
    if v_outbound.conversation_id is distinct from p_conversation_id then
      raise exception 'outbound_intent_conversation_mismatch' using errcode = '22023';
    end if;

    if public.normalize_prepared_response_text(v_outbound.content) = public.normalize_prepared_response_text(p_body) then
      v_prepared_response_outcome := 'sent';
    else
      v_prepared_response_outcome := 'edited';
    end if;
  end if;

  if v_conv.external_participant_id is null and p_author_type = 'external_participant' then
    update public.conversations set external_participant_id = p_author_external_participant_id where id = p_conversation_id;
  end if;

  insert into public.conversation_messages (
    conversation_id, direction, author_type, author_profile_id, author_external_participant_id,
    channel, content_type, body, generated_by, origin_intake_id,
    replied_to_outbound_intent_id, prepared_response_outcome
  ) values (
    p_conversation_id, 'inbound', p_author_type,
    case when p_author_type = 'professional' then p_author_profile_id else null end,
    case when p_author_type = 'external_participant' then p_author_external_participant_id else null end,
    p_channel, p_content_type, p_body, 'human', p_origin_intake_id,
    p_replied_to_outbound_intent_id, v_prepared_response_outcome
  )
  returning * into v_message;

  update public.conversations set last_activity_at = now() where id = p_conversation_id;

  return v_message;
end;
$$;

comment on function public.persist_inbound_message is 'Orchestrator/Runtime — único caminho de escrita de mensagem inbound de EXTERNAL_PARTICIPANT (a RLS de conversation_messages só permite insert direto de mensagem própria do profissional, de propósito, e mesmo essa policy foi fechada em 0061). Estendida (0062) com p_origin_intake_id opcional. Estendida de novo (Conversas Bloco 2, 0066) com p_replied_to_outbound_intent_id opcional: quando presente, valida que o outbound_intent pertence à mesma conversation e grava replied_to_outbound_intent_id + prepared_response_outcome (fato observado ''sent''/''edited'' via comparação determinística, nunca interpretação) no mesmo INSERT — nunca recomputado depois. Retry (dedupe por claim_inbound_event, migration 0051) nunca chama esta function duas vezes pro mesmo evento, então o fato persistido nunca muda numa nova tentativa.';

revoke all on function public.persist_inbound_message from public;
grant execute on function public.persist_inbound_message to service_role;
revoke execute on function public.persist_inbound_message from anon, authenticated;
