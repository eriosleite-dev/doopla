-- Doopla — Beta Fechado por código (Entrega 2).
--
-- Decisão da fundadora (07/10/2026): beta_invite_codes é conceito
-- separado de invites (convite de equipe entre pessoas já dentro) e de
-- founder_vouchers (trava um PREÇO futuro, nunca dá acesso grátis) —
-- nunca misturar os três. Beta libera acesso completo equivalente a
-- Pro, nunca inicia cobrança real, nunca mexe em trial_ends_at.
--
-- Fluxo: um único código, reaproveitado por todo mundo que a fundadora
-- convidar (max_uses alto/null, não um código por pessoa). A pessoa já
-- tem conta de artista criada (fluxo de cadastro normal, sem nenhuma
-- mudança) e cola o código na etapa "Escolha como quer começar"
-- (PlanForm.tsx) — resgate roda autenticado, no mesmo lugar que já
-- valida o plano escolhido (savePlanAction), sem tocar em
-- handle_new_user() pela 3ª vez no mesmo dia.
--
-- is_beta_free=true é só uma marcação — nunca gera cobrança quando o
-- billing real (Stripe/Pagar.me) for ligado. Mesmo espírito do
-- app_settings.billing_enabled (migration 0099): sinalizador, nunca
-- lógica de cobrança embutida aqui.

create table public.beta_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  max_uses integer,
  uses_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.beta_invite_codes is 'Códigos de acesso ao Beta Fechado — resgatados via redeem_beta_code(), nunca lidos/escritos direto pelo client (RLS sem nenhuma policy, mesmo padrão de app_settings). max_uses null = sem limite de resgates.';

alter table public.beta_invite_codes enable row level security;
-- Sem nenhuma policy de propósito — RLS sem policy nega tudo pro
-- client. Só redeem_beta_code (SECURITY DEFINER) lê/escreve aqui.

alter table public.subscriptions add column is_beta_free boolean not null default false;

comment on column public.subscriptions.is_beta_free is 'true = acesso concedido via beta_invite_codes, não corresponde a assinatura paga. Nunca cobra quando billing real for ativado — é só uma marcação de origem do entitlement.';

create or replace function public.redeem_beta_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_already_beta boolean;
  v_claimed_code_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'artista' then
    raise exception 'beta_only_for_artists' using errcode = 'P0001';
  end if;

  select is_beta_free into v_already_beta from public.subscriptions where profile_id = v_uid;
  if v_already_beta then
    raise exception 'already_beta' using errcode = 'P0001';
  end if;

  -- UPDATE...RETURNING atômico, mesma técnica de invites (migration
  -- 0100) — a trava de linha do UPDATE serializa resgates simultâneos
  -- do MESMO código perto do limite de max_uses, sem SELECT de
  -- validação separado.
  update public.beta_invite_codes
  set uses_count = uses_count + 1
  where code = p_code
    and active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses_count < max_uses)
  returning id into v_claimed_code_id;

  if v_claimed_code_id is null then
    raise exception 'invalid_beta_code' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set
    artist_plan = 'pro',
    status = 'active',
    is_beta_free = true,
    trial_ends_at = null,
    updated_at = now()
  where profile_id = v_uid;
end;
$$;

comment on function public.redeem_beta_code(text) is 'Único ponto de resgate de código de beta. Autenticado, role=artista, 1 resgate por conta (already_beta bloqueia o 2º), código reclamado via UPDATE...RETURNING atômico. Concede artist_plan=pro + status=active + is_beta_free=true, nunca mexe em billing real.';

-- Lição do achado de hoje (migration 0100, add_secondary_role): toda
-- function nova nasce com EXECUTE liberado pra PUBLIC por padrão, e
-- PUBLIC inclui authenticated implicitamente — revoga de PUBLIC
-- explicitamente antes de conceder só a authenticated, nunca confia
-- no grant seletivo sozinho.
revoke execute on function public.redeem_beta_code(text) from public;
grant execute on function public.redeem_beta_code(text) to authenticated;
