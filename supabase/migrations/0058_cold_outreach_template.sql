-- Doopla Intelligence Core v1 — Runtime, passo 6A+6B, Fase 2: suporte
-- ao primeiro outreach real ("profissional manda contato -> Doopla
-- inicia" fora de uma CSW aberta). Só 2 mudanças, mínimas por decisão
-- do usuário — auditoria confirmou que nenhum dado adicional é
-- necessário: outbound_intents.send_as (a UNICA coluna nova) e uma RPC
-- de leitura pra derivar CSW (Customer Service Window) de mensagens
-- inbound REAIS, nunca um estado persistido/inventado à parte.

-- ============================================================
-- 1. outbound_intents.send_as — "que FORMA de envio este registro
-- exige", nunca um segundo lugar que decide O QUE comunicar
-- (outbound_intents.content continua sendo isso). Default 'free_text'
-- preserva 100% do comportamento anterior pra toda linha existente e
-- pra qualquer chamador que não passe o parâmetro novo.
-- ============================================================
alter table public.outbound_intents
  add column send_as text not null default 'free_text' check (send_as in ('free_text', 'template'));

comment on column public.outbound_intents.send_as is 'Passo 6A+6B Fase 2 — "template" exige o payload fixo template/idioma/parâmetros (constantes versionadas em código, nunca uma tabela própria) em vez de texto livre; content continua sendo a representação HUMANA do que foi de fato comunicado nos dois casos. O sender SEMPRE revalida a condição legal (CSW) no momento do envio, nunca confia cegamente neste campo (ver client.ts/send-outbound-intents/route.ts) — send_as é a intenção registrada na criação, não uma autorização de envio incondicional.';

-- create or replace NÃO basta aqui: adicionar um parâmetro novo muda a
-- assinatura (name+arg-types), então o Postgres criaria um SEGUNDO
-- overload em vez de substituir o original — precisa dropar a
-- assinatura antiga explicitamente primeiro, senão as duas convivem e
-- viram ambíguas pra qualquer chamador sem o argumento novo.
drop function if exists public.create_outbound_intent(uuid, uuid, uuid, uuid, text, uuid, text);

create function public.create_outbound_intent(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_run_id uuid,
  p_policy_decision_id uuid,
  p_channel text,
  p_recipient_external_participant_id uuid,
  p_content text,
  p_send_as text default 'free_text'
)
returns public.outbound_intents
language plpgsql
security definer set search_path = public
as $$
declare
  v_professional_id uuid;
  v_row public.outbound_intents;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select represented_professional_id into v_professional_id from public.conversations where id = p_conversation_id;
  if v_professional_id is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  insert into public.outbound_intents (
    conversation_id, professional_id, trigger_message_id, run_id, policy_decision_id,
    channel, recipient_external_participant_id, content, send_as
  ) values (
    p_conversation_id, v_professional_id, p_trigger_message_id, p_run_id, p_policy_decision_id,
    p_channel, p_recipient_external_participant_id, p_content, p_send_as
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_outbound_intent is 'Assinatura estendida na Fase 2 do 6A+6B (send_as, default free_text — nenhum chamador existente muda de comportamento). Continua o único ponto de escrita de outbound_intents.';

-- ============================================================
-- 2. get_last_whatsapp_inbound_at — deriva CSW de conversation_messages
-- real, nunca um segundo estado persistido. Escopo por
-- external_participant_id (não por conversation_id): a CSW é uma
-- propriedade do par número-da-Doopla<->número-do-cliente, não de uma
-- linha de conversation específica — um participante pode atravessar
-- mais de uma conversation ao longo do tempo (raiz comercial terminal),
-- e a janela continua a mesma.
-- ============================================================
create function public.get_last_whatsapp_inbound_at(p_external_participant_id uuid)
returns timestamptz
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_result timestamptz;
begin
  if not public.is_system_caller() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select max(created_at) into v_result
  from public.conversation_messages
  where author_external_participant_id = p_external_participant_id
    and channel = 'whatsapp'
    and direction = 'inbound';

  return v_result;
end;
$$;

comment on function public.get_last_whatsapp_inbound_at is 'Passo 6A+6B Fase 2 — leitura pura pra derivar se há CSW (Customer Service Window, janela de 24h da Meta) aberta pra um participante externo, sem persistir nenhum estado novo. Retorna null quando esse participante nunca mandou uma mensagem whatsapp inbound de verdade (CSW nunca existiu). Usada tanto na criação (pipeline.ts, decide se o ramo determinístico de template se aplica) quanto na revalidação no momento do envio (send-outbound-intents/route.ts, nunca confia no valor congelado na criação).';

revoke all on function public.get_last_whatsapp_inbound_at from public;
grant execute on function public.get_last_whatsapp_inbound_at to service_role;
revoke execute on function public.get_last_whatsapp_inbound_at from anon, authenticated;
