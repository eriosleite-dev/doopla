-- ADR 0004 (Rodadas 4/5), task #72 — fluxo de confirmação de memória
-- de preferências: único RPC novo necessário pra fechar o ciclo
-- proposed -> approved/rejected a partir de uma resposta real da
-- profissional no WhatsApp/painel.
--
-- get_most_recent_proposed_memory: diferente de propósito de
-- get_most_recent_pending_delegated_contact (migration 0109) — aqui
-- SÓ interessa status='proposed' (nunca toda a história, nunca
-- approved/rejected/revoked), porque o único uso é "existe uma
-- pergunta de confirmação pendente que esta mensagem pode estar
-- respondendo?". Nunca reintroduz a classe de bug do ADR 0010
-- (estado antigo sem corte de recência decidindo por si só) — quem
-- chama isto (pipeline.ts) só considera o resultado relevante quando a
-- ÚLTIMA mensagem de IA da conversa é, literalmente, a pergunta de
-- confirmação determinística gerada pra ESSA linha específica
-- (buildMemoryConfirmationQuestion, memory-policy.ts) — nunca só "uma
-- proposta existe".
create function public.get_most_recent_proposed_memory(
  p_professional_id uuid
)
returns public.professional_memories
language sql
security definer set search_path = public
stable
as $$
  select *
  from public.professional_memories
  where professional_id = p_professional_id
    and status = 'proposed'
  order by created_at desc
  limit 1;
$$;

comment on function public.get_most_recent_proposed_memory is 'Task #72 — leitura pro fluxo de confirmação em pipeline.ts: só status=proposed, mais recente. Quem chama precisa validar continuidade real (última mensagem de IA == pergunta de confirmação desta linha) antes de tratar a resposta da profissional como confirmação/rejeição — nunca assume relevância só por existir uma proposta.';

revoke all on function public.get_most_recent_proposed_memory from public;
grant execute on function public.get_most_recent_proposed_memory to service_role;
revoke execute on function public.get_most_recent_proposed_memory from anon, authenticated;

-- Mesmo padrão de delegated_contact_enabled (migration 0109/0117) e
-- professional_self_auto_reply_enabled (migration 0121): nasce
-- 'false' — nenhuma proposta NOVA nem confirmação é reconhecida em
-- pipeline.ts até a fundadora ligar isto explicitamente, numa
-- migration própria, depois de validar o fluxo. Desligado é custo
-- zero (pipeline.ts checa isto antes de qualquer leitura de estado ou
-- chamada a recognizer).
insert into public.app_settings (key, value)
values ('professional_memory_confirmation_enabled', 'false')
on conflict (key) do nothing;
