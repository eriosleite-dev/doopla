-- Settings V2 — Encerramento de conta (08/09/2026). Decisão de produto
-- já fechada (não é um redesign em aberto): "Excluir minha conta" é um
-- account closure flow centralizado, auditável e idempotente — NUNCA
-- um hard delete ingênuo.
--
-- Por que nunca DELETE em auth.users: profiles.id referencia
-- auth.users(id) ON DELETE CASCADE (migration 0001), e bookings
-- referencia profiles(id) ON DELETE CASCADE também (migration 0003) —
-- ou seja, apagar o auth user cascatearia até apagar bookings/
-- contratos/reviews da OUTRA parte, violando diretamente o requisito
-- de preservar histórico financeiro/contratual pra quem continua com a
-- conta ativa. A conta é encerrada por ESTADO (profiles.status),
-- nunca por remoção de linha.
--
-- "Novo cadastro futuro com mesmo e-mail é nova conta" é resolvido no
-- boundary de aplicação (Server Action com service_role, ver
-- src/app/dashboard/account-closure-actions.ts): o e-mail em
-- auth.users é trocado por um valor sintético não colidente via Admin
-- API (auth.admin.updateUserById), liberando o e-mail original pra um
-- signUp novo, e a conta é banida (ban_duration) + todas as sessões
-- são revogadas (auth.admin.signOut(scope: 'global')) — nenhuma dessas
-- três operações cabe numa function SQL comum (exigem a Admin API,
-- fora do alcance de RPCs SECURITY DEFINER rodando como Postgres).
-- close_own_account() abaixo faz só a parte que É de banco: o estado
-- terminal e os efeitos colaterais em dados que o produto já modela.

create type public.profile_status as enum ('active', 'closed');

alter table public.profiles
  add column status public.profile_status not null default 'active',
  add column status_changed_at timestamptz;

comment on column public.profiles.status is 'Encerramento de conta (08/09/2026) — "active" sempre, exceto depois de close_own_account(). "closed" nunca é revertido por nenhuma superfície do produto hoje (sem fluxo de restauração — decisão explícita: novo cadastro com o mesmo e-mail é conta nova, não reabertura).';

-- close_own_account() — parte SQL do encerramento. Idempotente (falha
-- alto nível se já fechada, nunca silenciosamente reaplica). Roda tudo
-- na mesma transação da RPC, então ou fecha tudo ou nada.
create function public.close_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rep record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and status = 'closed') then
    raise exception 'already_closed' using errcode = 'P0001';
  end if;

  -- Encerra toda representação ativa nos dois sentidos (artista sendo
  -- representado, ou booker representando outros) — reaproveita
  -- terminate_representation (migration 0033) inteiro, nunca uma
  -- segunda implementação da mesma lógica (fecha convite direto
  -- pendente do par, zera roteamento do Link de Orçamento, libera slot
  -- do Básico). Nunca apaga bookings/contratos já existentes — só a
  -- linha de vínculo.
  for v_rep in
    select id from public.representations
    where artist_profile_id = v_uid or booker_profile_id = v_uid
  loop
    perform public.terminate_representation(v_rep.id);
  end loop;

  -- Bookkeeping da assinatura própria — sem processador de pagamento
  -- real ainda (mesmo estágio do resto do produto), então "impedir
  -- cobranças futuras" hoje é só marcar o estado; um futuro webhook
  -- Stripe assume via service_role sem reabrir esta function.
  update public.subscriptions
  set canceled_at = coalesce(canceled_at, now()), updated_at = now()
  where profile_id = v_uid;

  -- Sai de descoberta pública (perfil de orçamento, roteamento de
  -- WhatsApp Inbound) — mesma coluna que essas duas superfícies já
  -- respeitam (`.eq('public_enabled', true)`), nenhuma checagem nova
  -- necessária nelas.
  update public.artist_profiles set public_enabled = false where profile_id = v_uid;

  -- Comunidade: nunca cascade-delete de tópicos/posts (discussão
  -- coletiva preservada de propósito). community_profiles_public
  -- (redefinida abaixo) passa a devolver "Usuário removido" pra
  -- qualquer leitor assim que profiles.status vira 'closed' — nenhuma
  -- coluna extra precisa mudar aqui além disso.
  update public.community_profiles set available_for_referrals = false where profile_id = v_uid;

  update public.profiles
  set status = 'closed', status_changed_at = now(), updated_at = now()
  where id = v_uid;
end;
$$;

comment on function public.close_own_account() is 'Parte SQL do account closure flow (Settings V2, 08/09/2026) — encerra representações, desativa descoberta pública, marca profiles.status=closed. A parte que exige Admin API (banir, revogar sessões, liberar e-mail) roda no boundary do server, nunca aqui.';

revoke all on function public.close_own_account() from public;
grant execute on function public.close_own_account() to authenticated;

-- community_profiles_public — mesma projeção de sempre (migration
-- 0076), só com uma checagem nova no topo: profile encerrado nunca
-- expõe identidade real pra ninguém, independente de visibility_status
-- (que continua sendo um assunto de moderação, não de encerramento de
-- conta — os dois nunca se misturam). display_name vira "Usuário
-- removido" e todo campo de apresentação/contato vira null — mas a
-- LINHA continua existindo (nunca cascade-delete), então tópicos/posts
-- antigos continuam resolvendo autor sem quebrar.
create or replace view public.community_profiles_public as
select
  cp.profile_id,
  case when p.status = 'closed' then 'Usuário removido' else coalesce(ap.stage_name, p.full_name) end as display_name,
  case when p.status = 'closed' then null else coalesce(prof.label, ap.category) end as profession_label,
  case when p.status = 'closed' then null else ap.category end as profession_id,
  case when p.status = 'closed' then false
    else coalesce(public.artist_has_doopla_pro(s.artist_plan, s.status, s.trial_ends_at), false) end as is_pro,
  (p.status <> 'closed' and cp.visibility_status = 'active' and cp.available_for_referrals) as available_for_referrals,
  (p.status <> 'closed' and (ap.stage_name is null or ap.category is null)) as is_incomplete,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_city then p.city end as city,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_city then p.state end as state,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_avatar then p.avatar_url end as avatar_url,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_bio then ap.bio end as bio,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_specialties then ap.genres end as specialties,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_work_types then ap.work_types end as work_types,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_instagram then ap.instagram_url end as instagram_url,
  case when p.status <> 'closed' and cp.visibility_status = 'active' and cp.show_portfolio then ap.portfolio_url end as portfolio_url,
  case when p.status = 'closed' then null else p.slug end as public_id
from public.community_profiles cp
join public.profiles p on p.id = cp.profile_id
left join public.artist_profiles ap on ap.profile_id = cp.profile_id
left join public.professions prof on prof.id = ap.category
left join public.subscriptions s on s.profile_id = cp.profile_id;

comment on view public.community_profiles_public is 'Única forma segura de ler dado de OUTRO profissional na Comunidade. visibility_status nunca é exposto na projeção (moderação é assunto interno). is_pro usa a autoridade canônica artist_has_doopla_pro(). public_id é profiles.slug. profile com status=closed (08/09/2026) devolve "Usuário removido" e todo campo de apresentação/contato como null, independente de visibility_status — encerramento de conta e moderação são conceitos diferentes, nunca misturados.';

revoke all on public.community_profiles_public from public, anon;
grant select on public.community_profiles_public to authenticated;
