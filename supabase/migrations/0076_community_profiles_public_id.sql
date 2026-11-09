-- Desambiguação de homônimos no autocomplete de @menções da Comunidade
-- (08/09/2026). Auditoria: profiles.slug já é o "identificador público
-- estável" da plataforma — gerado pra QUALQUER papel desde a migration
-- 0071 (ver src/lib/public-id.ts, chamado por getSessionProfile() na
-- primeira visita ao painel), único (checado em loop na geração),
-- já tratado como público em outros contextos (roteamento de WhatsApp
-- por link individual, busca "Adicionar profissional/Booker" por
-- código, "Seu código ID" em BookingChannelsCard) — nunca dado
-- sensível, nunca gated por preferência show_*. Não é criado nada novo
-- aqui: só mais uma coluna já existente exposta pela view de leitura
-- segura que a Comunidade já usa pra tudo (community_profiles_public,
-- 0059, atualizada em 0074), mesmo padrão das duas vezes anteriores.
--
-- Exposto incondicionalmente (fora do bloco de campos gated por
-- cp.visibility_status/show_*) — mesmo tratamento de display_name/
-- profession_label/is_pro/is_incomplete, que já não são condicionados
-- a nenhuma preferência de privacidade: é identidade pública estável,
-- não dado íntimo opt-in.
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
  case when cp.visibility_status = 'active' and cp.show_portfolio then ap.portfolio_url end as portfolio_url,
  p.slug as public_id
from public.community_profiles cp
join public.profiles p on p.id = cp.profile_id
left join public.artist_profiles ap on ap.profile_id = cp.profile_id
left join public.professions prof on prof.id = ap.category
left join public.subscriptions s on s.profile_id = cp.profile_id;

comment on view public.community_profiles_public is 'Única forma segura de ler dado de OUTRO profissional na Comunidade. visibility_status nunca é exposto na projeção (moderação é assunto interno). is_pro usa a autoridade canônica artist_has_doopla_pro(). public_id (08/09/2026) é profiles.slug — identificador público estável já usado em outros pontos da plataforma, usado aqui como último desempate visual entre homônimos no autocomplete de @menções; nunca a identidade técnica da menção, que continua sendo profile_id.';

revoke all on public.community_profiles_public from public, anon;
grant select on public.community_profiles_public to authenticated;
