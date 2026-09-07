-- Doopla — Autoridade canônica única de "este artista tem Doopla Pro
-- agora" (07/09/2026), substituindo as 3 cópias divergentes que
-- existiam (migration 0073, migration 0067's get_professional_home_facts,
-- migration 0059's community_profiles_public.is_pro), todas fazendo
-- `artist_plan = 'pro' and status = 'active'` sem considerar trial.
--
-- Definição aprovada:
--   PRO = artist_plan = 'pro' AND (
--     status = 'active'
--     OR (status = 'trialing' AND trial_ends_at >= hoje)
--   )
--   BÁSICO = qualquer outro caso (inclui trialing vencido, canceled,
--   artist_plan = 'doopla', sem subscription).
--
-- Trial não precisa fisicamente mudar de status pra expirar — nenhum
-- sweep/cron novo. A autoridade só nega Pro quando trial_ends_at
-- vence, lendo a mesma linha que sempre existiu (migration 0031).
-- Lifecycle financeiro (active/past_due/canceled reais via webhook)
-- evolui depois com Real Billing, sem precisar mexer aqui de novo —
-- só os dois primeiros ramos (`status = 'active'`) já cobrem isso.
--
-- Comparação de data sempre em UTC — (now() at time zone 'utc')::date
-- — pra nunca divergir do lado TS, que usa
-- `new Date().toISOString().slice(0, 10)` (também UTC), independente
-- de qual timezone o servidor Postgres estiver configurado.
create or replace function public.artist_has_doopla_pro(
  p_artist_plan text,
  p_status text,
  p_trial_ends_at date
)
returns boolean
language sql
stable
as $$
  select p_artist_plan = 'pro' and (
    p_status = 'active'
    or (
      p_status = 'trialing'
      and p_trial_ends_at is not null
      and p_trial_ends_at >= (now() at time zone 'utc')::date
    )
  );
$$;

comment on function public.artist_has_doopla_pro(text, text, date) is 'Autoridade canônica única de entitlement Doopla Pro do artista — espelha exatamente hasDooplaPro() em src/lib/subscription.ts (e mobile/src/lib/subscription.ts), nunca diverge. Consumida por assert_artist_booking_monthly_limit (0073), get_professional_home_facts (0067) e community_profiles_public.is_pro (0059) — nenhum desses lugares reimplementa a regra inline de novo.';

-- =====================================================================
-- Reconciliação 1: limite de bookings (migration 0073) consome a
-- autoridade em vez de reimplementar a mesma expressão booleana.
-- =====================================================================
create or replace function public.assert_artist_booking_monthly_limit(p_artist_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_pro boolean;
  v_month_start timestamptz;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('artist_booking_monthly_limit:' || p_artist_profile_id::text));

  select coalesce(public.artist_has_doopla_pro(artist_plan, status, trial_ends_at), false) into v_is_pro
  from public.subscriptions
  where profile_id = p_artist_profile_id and role = 'artista';

  if v_is_pro then
    return;
  end if;

  v_month_start := date_trunc('month', now());

  select count(*) into v_count
  from public.bookings
  where artist_profile_id = p_artist_profile_id
    and created_at >= v_month_start
    and created_at < v_month_start + interval '1 month';

  if v_count >= 5 then
    raise exception 'artist_booking_monthly_limit_reached' using errcode = 'P0001';
  end if;
end;
$$;

-- =====================================================================
-- Reconciliação 2: get_professional_home_facts() passa a expor
-- has_doopla_pro já calculado (mais trial_ends_at cru, pra Configurações
-- que lê a subscription completa separadamente não precisar de uma
-- segunda fonte) — Web e App leem o boolean pronto, nenhum dos dois
-- reimplementa a regra em TS duas vezes. Muda o RETURNS TABLE, então
-- precisa DROP + CREATE (CREATE OR REPLACE não permite mudar a lista
-- de colunas do retorno).
-- =====================================================================
drop function if exists public.get_professional_home_facts();

create function public.get_professional_home_facts()
returns table (
  professional_id uuid,
  full_name text,
  account_created_at timestamptz,

  whatsapp_identity_status text,
  whatsapp_verified_number text,

  bookings_awaiting_response_count integer,
  bookings_confirmed_count integer,
  bookings_completed_count integer,

  next_booking_id uuid,
  next_booking_event_date date,
  next_booking_other_party_name text,

  conversations_needing_you_count integer,

  referral_total_count integer,
  referral_qualified_count integer,

  subscription_role text,
  subscription_status text,
  subscription_plan text,
  subscription_trial_ends_at date,
  has_doopla_pro boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    auth.uid() as professional_id,
    p.full_name,
    p.created_at as account_created_at,

    wi.status as whatsapp_identity_status,
    wi.verified_number as whatsapp_verified_number,

    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status = 'proposta_enviada'
        and b.proposed_by <> 'artista'
    )::integer as bookings_awaiting_response_count,
    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status in ('aceita', 'aguardando_pagamento')
    )::integer as bookings_confirmed_count,
    (
      select count(*) from public.bookings b
      where b.artist_profile_id = auth.uid()
        and b.status = 'concluida'
    )::integer as bookings_completed_count,

    nb.id as next_booking_id,
    nb.event_date as next_booking_event_date,
    nb_other.full_name as next_booking_other_party_name,

    (
      select count(*) from public.conversations c
      where c.represented_professional_id = auth.uid()
        and c.status = 'open'
        and (
          exists (
            select 1 from public.runtime_pending_replies rpr
            where rpr.conversation_id = c.id and rpr.status = 'pending'
          )
          or coalesce((
            select oi.delivery_state from public.outbound_intents oi
            where oi.conversation_id = c.id
            order by oi.created_at desc
            limit 1
          ), '') = 'policy_allowed'
        )
    )::integer as conversations_needing_you_count,

    (
      select count(*) from public.referrals r
      where r.referrer_profile_id = auth.uid()
    )::integer as referral_total_count,
    (
      select count(*) from public.referrals r
      where r.referrer_profile_id = auth.uid() and r.status = 'qualificada'
    )::integer as referral_qualified_count,

    s.role::text as subscription_role,
    s.status::text as subscription_status,
    case when s.role = 'artista' then s.artist_plan::text else null end as subscription_plan,
    case when s.role = 'artista' then s.trial_ends_at else null end as subscription_trial_ends_at,
    case
      when s.role = 'artista'
        then coalesce(public.artist_has_doopla_pro(s.artist_plan, s.status, s.trial_ends_at), false)
      else false
    end as has_doopla_pro
  from public.profiles p
  left join public.professional_whatsapp_identities wi on wi.professional_id = p.id
  left join public.subscriptions s on s.profile_id = p.id
  left join lateral (
    select b.id, b.event_date, b.booker_profile_id
    from public.bookings b
    where b.artist_profile_id = auth.uid()
      and b.status in ('aceita', 'aguardando_pagamento')
      and b.event_date is not null
      and b.event_date >= current_date
    order by b.event_date asc
    limit 1
  ) nb on true
  left join public.profiles nb_other on nb_other.id = nb.booker_profile_id
  where p.id = auth.uid();
$$;

comment on function public.get_professional_home_facts is 'Professional Product UI Foundation — read model canônico dos fatos objetivamente contáveis da Home (Web+App), SECURITY INVOKER sobre RLS já testada de cada tabela. conversations_needing_you_count usa o MESMO critério de deriveConversationState(). has_doopla_pro (07/09/2026) usa a autoridade canônica artist_has_doopla_pro() — nunca recalculado em TS a partir de subscription_plan/subscription_status cru.';

revoke all on function public.get_professional_home_facts() from public;
grant execute on function public.get_professional_home_facts() to authenticated;
revoke execute on function public.get_professional_home_facts() from anon, service_role;

-- =====================================================================
-- Reconciliação 3: community_profiles_public.is_pro consome a mesma
-- autoridade — trial válido também mostra o selo Pro no perfil
-- público da Comunidade, trial vencido/canceled deixa de mostrar.
-- Só essa expressão muda; nenhuma outra coluna/UX da view é tocada.
-- =====================================================================
create or replace view public.community_profiles_public as
select
  cp.profile_id,
  coalesce(ap.stage_name, p.full_name) as display_name,
  coalesce(prof.label, ap.category) as profession_label,
  ap.category as profession_id,
  coalesce(public.artist_has_doopla_pro(s.artist_plan, s.status, s.trial_ends_at), false) as is_pro,
  (cp.visibility_status = 'active' and cp.available_for_referrals) as available_for_referrals,
  (ap.stage_name is null or ap.category is null) as is_incomplete,
  case when cp.visibility_status = 'active' and cp.show_city then p.city end as city,
  case when cp.visibility_status = 'active' and cp.show_city then p.state end as state,
  case when cp.visibility_status = 'active' and cp.show_avatar then p.avatar_url end as avatar_url,
  case when cp.visibility_status = 'active' and cp.show_bio then ap.bio end as bio,
  case when cp.visibility_status = 'active' and cp.show_specialties then ap.genres end as specialties,
  case when cp.visibility_status = 'active' and cp.show_work_types then ap.work_types end as work_types,
  case when cp.visibility_status = 'active' and cp.show_instagram then ap.instagram_url end as instagram_url,
  case when cp.visibility_status = 'active' and cp.show_portfolio then ap.portfolio_url end as portfolio_url
from public.community_profiles cp
join public.profiles p on p.id = cp.profile_id
left join public.artist_profiles ap on ap.profile_id = cp.profile_id
left join public.professions prof on prof.id = ap.category
left join public.subscriptions s on s.profile_id = cp.profile_id;

comment on view public.community_profiles_public is 'Única forma segura de ler dado de OUTRO profissional na Comunidade. visibility_status nunca é exposto na projeção (moderação é assunto interno). is_pro (07/09/2026) usa a autoridade canônica artist_has_doopla_pro() — trial válido conta como Pro.';

revoke all on public.community_profiles_public from public, anon;
grant select on public.community_profiles_public to authenticated;
