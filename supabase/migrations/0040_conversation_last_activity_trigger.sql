-- Doopla Intelligence OS v1 — bump automático de
-- conversations.last_activity_at quando uma nova conversation_message
-- é criada. Trigger simples e determinístico no banco, pra
-- last_activity_at nunca depender de uma integração futura lembrar de
-- atualizá-lo manualmente.
--
-- conversations.last_activity_at está fora do alcance de UPDATE direto
-- de authenticated (revogado na migration 0039, junto com o resto da
-- tabela) — por isso a function precisa ser security definer, mesmo
-- padrão já usado em create_conversation/set_conversation_mandate/
-- advance_conversation_state. Só toca last_activity_at, só na conversa
-- da mensagem inserida — nenhum outro campo, nenhuma outra linha.

create function public.bump_conversation_last_activity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.conversations
  set last_activity_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

comment on function public.bump_conversation_last_activity is 'Atualiza só conversations.last_activity_at da conversa correspondente à mensagem inserida — nenhum outro campo, nenhuma outra linha. security definer porque last_activity_at está fora do alcance de UPDATE direto de authenticated.';

revoke all on function public.bump_conversation_last_activity from public;

create trigger bump_conversation_last_activity_trigger
  after insert on public.conversation_messages
  for each row execute function public.bump_conversation_last_activity();
