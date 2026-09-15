-- Doopla — Formulário de Contato (/contato): persistência real das
-- mensagens antes de qualquer tentativa de notificação por e-mail
-- (Resend). Antes disso o formulário só abria um mailto: local — nunca
-- havia registro nem entrega de verdade.
--
-- Mensagem de contato não pertence a nenhum profile específico (não é
-- "meu dado", é uma mensagem endereçada à Doopla) — por isso, ao
-- contrário da maioria das tabelas do produto, não há policy de
-- select/update/delete pra anon/authenticated: só service_role
-- (Supabase Studio) lê. Único caminho de escrita é via as 2 functions
-- abaixo, mesmo padrão de "porta única" já usado em
-- submit_orcamento_request (0023) e get_invite_by_token (0034) pra
-- fluxos públicos sem conta.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),
  notification_error text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.contact_messages is 'Mensagens do formulário /contato. A gravação aqui SEMPRE acontece antes de qualquer tentativa de notificação por e-mail (Resend) — se o Resend falhar, a mensagem já está salva e nunca se perde. notification_status só rastreia o resultado dessa tentativa; nunca bloqueia nem desfaz o insert.';
comment on column public.contact_messages.notification_status is 'pending = ainda não tentou notificar · sent = Resend aceitou o envio · failed = Resend falhou ou RESEND_API_KEY não configurada (ver notification_error).';

alter table public.contact_messages enable row level security;
-- Sem nenhuma policy de propósito: RLS habilitada + zero policies =
-- ninguém (anon/authenticated) lê, escreve ou apaga direto na tabela.
-- Escrita só pelas 2 functions security definer abaixo; leitura só via
-- service_role (Supabase Studio).

-- 1. Registrar a mensagem (chamada pelo Server Action no submit).
-- Formato de e-mail já validado antes, no Server Action (zod) — aqui só
-- garante campos não vazios e aplica um limite básico de frequência por
-- e-mail (proteção simples contra spam, sem introduzir infraestrutura
-- nova como captcha/WAF).
create function public.submit_contact_message(
  p_name text,
  p_email text,
  p_subject text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'subject_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'message_required' using errcode = 'P0001';
  end if;

  select count(*) into v_recent_count
  from public.contact_messages
  where email = trim(p_email)
    and created_at > now() - interval '10 minutes';

  if v_recent_count >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.contact_messages (name, email, subject, message)
  values (trim(p_name), trim(p_email), trim(p_subject), trim(p_message))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_contact_message is 'Único caminho de INSERT em contact_messages, público (anon + authenticated) — /contato não exige conta.';

revoke all on function public.submit_contact_message from public;
grant execute on function public.submit_contact_message to anon, authenticated;

-- 2. Registrar o resultado da tentativa de notificação por e-mail
-- (chamada pelo Server Action depois de tentar o Resend, sucesso ou
-- falha) — sempre best-effort, nunca no caminho crítico do usuário: a
-- mensagem já está persistida antes desta chamada acontecer.
--
-- `where notification_status = 'pending'` restringe a função a uma
-- única transição (pending -> sent/failed): não é uma trava de posse
-- (não há dono desta tabela), é só evitar que a mesma mensagem seja
-- "reaberta" repetidamente. O `id` retornado por submit_contact_message
-- nunca é devolvido ao client (fica só no Server Action, servidor a
-- servidor) — sem esse id em mãos, não há como um chamador anônimo
-- mirar uma linha específica.
create function public.mark_contact_message_notification(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  update public.contact_messages
  set notification_status = p_status,
      notification_error = p_error,
      notified_at = now()
  where id = p_id
    and notification_status = 'pending';
end;
$$;

comment on function public.mark_contact_message_notification is 'Bookkeeping pós-tentativa de envio (Resend). Só transiciona pending -> sent/failed; nunca reescreve uma linha já resolvida.';

revoke all on function public.mark_contact_message_notification from public;
grant execute on function public.mark_contact_message_notification to anon, authenticated;
