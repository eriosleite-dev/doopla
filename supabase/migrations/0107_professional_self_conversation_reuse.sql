-- P0 — continuidade conversacional de professional_self (14/10/2026).
--
-- Causa raiz comprovada: create_conversation (migration 0082) só
-- reaproveita uma conversa existente quando p_external_participant_id
-- não é nulo — e professional_self é estruturalmente PROIBIDA de ter
-- participante externo (constraint professional_self_conversation_cannot_have_external_participant,
-- migration 0051). Resultado real em produção: toda mensagem do
-- profissional verificado pro WhatsApp oficial criava uma conversa
-- NOVA, sem nenhum histórico — "Sim"/"Confirmado" chegavam ao modelo
-- como mensagens isoladas, sem a pergunta que respondiam.
--
-- Correção: 2º ramo de idempotência, paralelo ao existente, mesma
-- chave de trava (pg_advisory_xact_lock) mas namespaced com um prefixo
-- próprio pra nunca colidir com o espaço de chaves do ramo de
-- external_participant_id. Reaproveita por represented_professional_id
-- sozinho — nunca filtra por status (mesmo critério do ramo já
-- existente, que também reaproveita independente de open/closed/
-- archived; decisão deliberada de manter consistência, não introduzir
-- um comportamento novo).
--
-- Nunca toca: Classifier, Planner, enums de intent/response-plan,
-- Approval Engine, regras comerciais. Assinatura da function
-- inalterada — nenhum chamador existente precisa mudar.
create or replace function public.create_conversation(
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
  v_is_system boolean;
  v_lock_key bigint;
begin
  v_is_system := public.is_system_caller();

  if not v_is_system and auth.uid() is distinct from p_represented_professional_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_conversation_type = 'professional_self' and p_external_participant_id is not null then
    raise exception 'professional_self_conversation_cannot_have_external_participant'
      using errcode = '23514';
  end if;

  -- Ramo 1 (inalterado desde 0082): reaproveita por (profissional,
  -- participante externo) — exclusivo de external_inquiry, que sempre
  -- tem participante.
  if v_is_system and p_external_participant_id is not null then
    v_lock_key := hashtextextended(p_represented_professional_id::text || '|' || p_external_participant_id::text, 44);
    perform pg_advisory_xact_lock(v_lock_key);

    select * into v_conversation
    from public.conversations
    where represented_professional_id = p_represented_professional_id
      and external_participant_id = p_external_participant_id
    order by created_at desc
    limit 1;

    if found then
      return v_conversation;
    end if;
  end if;

  -- Ramo 2 (novo, P0 14/10/2026): reaproveita por profissional sozinho
  -- — exclusivo de professional_self, que nunca tem participante
  -- externo (constraint acima garante isso incondicionalmente).
  -- Prefixo 'professional_self|' garante que esta chave de advisory
  -- lock nunca colide com a do ramo 1 (que nunca inclui esse texto).
  if v_is_system and p_conversation_type = 'professional_self' then
    v_lock_key := hashtextextended('professional_self|' || p_represented_professional_id::text, 44);
    perform pg_advisory_xact_lock(v_lock_key);

    select * into v_conversation
    from public.conversations
    where represented_professional_id = p_represented_professional_id
      and conversation_type = 'professional_self'
    order by created_at desc
    limit 1;

    if found then
      return v_conversation;
    end if;
  end if;

  return public._create_conversation_core(
    p_represented_professional_id => p_represented_professional_id,
    p_conversation_type => p_conversation_type,
    p_external_participant_id => p_external_participant_id,
    p_origin => p_origin,
    p_origin_reference => p_origin_reference,
    p_channel => p_channel,
    p_initial_mandate => p_initial_mandate,
    p_initial_state => p_initial_state,
    p_transferred_from_conversation_id => p_transferred_from_conversation_id
  );
end;
$$;

comment on function public.create_conversation is 'Idempotência de criação: ramo 1 reaproveita por (profissional, participante externo) — external_inquiry; ramo 2 (P0 14/10/2026) reaproveita por profissional sozinho — professional_self, que nunca tem participante externo. Os dois ramos são mutuamente exclusivos por conversation_type/p_external_participant_id, nunca se sobrepõem. Nenhum dos dois filtra por status (open/closed/archived) — reaproveita a conversa mais recente independente do estado, mesmo critério desde a 0082.';
