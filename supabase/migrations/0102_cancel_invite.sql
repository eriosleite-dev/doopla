-- Doopla — cancelar convite pendente.
--
-- Achado da fundadora (07/10/2026, durante o QA da trava de convite
-- Booker): "Minha equipe" não tinha jeito nenhum de cancelar um
-- convite já enviado — só "Reenviar" (regenera o token) existia.
-- Checado: nenhuma policy de invites permite UPDATE/DELETE pelo
-- inviter_profile_id (só "invitee can confirm", exclusiva de quem
-- recebe), e não existe policy de delete nenhuma. Sem RPC, não tem
-- como cancelar.
--
-- Comportamento: deleta a linha de vez, sem guardar um status
-- "cancelado" — só funciona se quem chama for o inviter_profile_id E
-- o convite ainda estiver 'pendente' (nunca mexe em convite já
-- aceito/confirmado).

create or replace function public.cancel_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.invites
  where id = p_invite_id
    and inviter_profile_id = auth.uid()
    and status = 'pendente';
end;
$$;

comment on function public.cancel_invite(uuid) is 'Cancela (deleta) um convite ainda pendente, só pra quem enviou (inviter_profile_id = auth.uid()). Nunca mexe em convite já confirmado.';

revoke execute on function public.cancel_invite(uuid) from public;
grant execute on function public.cancel_invite(uuid) to authenticated;
