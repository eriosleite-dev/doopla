-- Doopla — Billing kill switch (Entrega 1 do Beta Fechado por Convite).
--
-- Achado de auditoria (02/10/2026): o modal "Booker Pro"
-- (booker-pro-modal.tsx) mostra "R$49/mês · Cobrança mensal,
-- recorrente" e o botão "Confirmar assinatura" chama a RPC
-- confirm_booker_pro_upgrade — que concede booker_plan='pro' real, na
-- hora, SEM nenhum processador de pagamento por trás (não existe
-- Stripe/Pagar.me integrado em lugar nenhum do produto ainda). Ou
-- seja: hoje, qualquer booker autenticado se autoconcede o plano pago
-- completo de graça, com uma interface que afirma estar cobrando.
--
-- Fonte de verdade da trava fica no Postgres, nunca só no .env do
-- Next — confirm_booker_pro_upgrade tem grant a `authenticated`
-- (nunca restrito a service_role), então é chamável direto via API do
-- Supabase, pulando o Next.js inteiro. Uma flag só no .env não
-- impediria isso.
--
-- Reversível por desenho: reativar billing é um UPDATE de uma linha
-- (`update app_settings set value='true' where key='billing_enabled'`),
-- nunca uma nova migration.
--
-- Escopo desta migration: SÓ a trava de confirm_booker_pro_upgrade.
-- cancel_booker_pro NÃO é alterada — ela só reduz/agenda a remoção de
-- entitlement (canceled_at + pro_period_ends_at em +30 dias, nunca
-- concede nem aumenta nada), nunca simula uma nova contratação, então
-- não se encaixa na regra "billing_enabled bloqueia o que cria/aumenta
-- entitlement comercial". Bloquear cancelamento seria impedir alguém
-- de sair de um estado Pro indevido — o oposto do que esta correção
-- quer.

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Flags operacionais globais, fonte de verdade no banco — lida só por functions SECURITY DEFINER (nunca por client direto: sem policy de select/update pra anon/authenticated). Alterar valor é um UPDATE simples, nunca exige nova migration. Reservado também pra beta_invite_required (Entrega 2, ainda não criada).';

insert into public.app_settings (key, value) values ('billing_enabled', 'false');

alter table public.app_settings enable row level security;
-- Sem nenhuma policy pra anon/authenticated de propósito — RLS sem
-- policy = nega tudo pro client. Só SECURITY DEFINER functions (que
-- rodam com o privilégio do dono, ignorando RLS) leem esta tabela.

create or replace function public.confirm_booker_pro_upgrade()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_billing_enabled text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select value into v_billing_enabled from public.app_settings where key = 'billing_enabled';
  if coalesce(v_billing_enabled, 'false') <> 'true' then
    raise exception 'billing_disabled' using errcode = 'P0001';
  end if;

  select role into v_role from public.subscriptions where profile_id = v_uid;
  if v_role is distinct from 'booker' then
    raise exception 'only_bookers_can_upgrade' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set
    booker_plan = 'pro',
    status = 'active',
    pro_period_ends_at = null,
    active_artist_profile_id = null,
    active_artist_pending_choice = false,
    canceled_at = null,
    updated_at = now()
  where profile_id = v_uid;
end;
$$;

comment on function public.confirm_booker_pro_upgrade() is 'Único caminho de escrita do upgrade Booker Pro. A partir de 02/10/2026: bloqueada enquanto app_settings.billing_enabled <> ''true'' (hotfix do bug de upgrade de graça com copy de cobrança falsa). Reversível via UPDATE em app_settings, nunca requer nova migration. cancel_booker_pro nunca foi alterada — só esta function ganhou o gate.';

revoke all on function public.confirm_booker_pro_upgrade() from public;
grant execute on function public.confirm_booker_pro_upgrade() to authenticated;
