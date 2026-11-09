-- Doopla — Ajuste dos critérios de classificação de agências (0129),
-- com os números reais definidos pela fundadora (antes só havia
-- placeholder, já reportado). Mudança estrutural, não só de valor:
--
-- - Prioridade alta: equipe E artistas, os DOIS mínimos ao mesmo tempo
--   (AND) — 6+ pessoas E 30+ artistas.
-- - Fora do perfil: equipe OU artistas, QUALQUER UM dos dois teto
--   (OR) — 1 pessoa na operação OU até 10 artistas. Antes de 0130,
--   "fora do perfil" era só o resíduo de não bater nem prioridade nem
--   potencial futuro; agora é uma regra explícita própria.
-- - Potencial futuro: tudo que não é nem prioridade nem fora do
--   perfil — o meio-termo, sem limiar próprio (requisito: nunca
--   precisa de número próprio, é definido pelos outros dois).
-- - Volume mensal de solicitações CONTINUA sendo coletado e exibido
--   (análise/distribuição no Admin), mas nunca entra na classificação
--   — não existe mais nenhuma coluna de limiar de volume nesta tabela.
--
-- Nunca edita 0129 (já aplicada em produção) — migration aditiva/
-- substitutiva, mesmo padrão já usado neste repo (ex.: 0127 corrige
-- 0125 sem reescrever o arquivo original).

alter table public.agency_classification_criteria
  drop column priority_min_monthly_requests,
  drop column future_min_team_size,
  drop column future_min_artists,
  drop column future_min_monthly_requests,
  add column out_of_profile_max_team_size integer not null default 1,
  add column out_of_profile_max_artists integer not null default 10;

comment on table public.agency_classification_criteria is 'Linha ÚNICA (seedada por 0129, nunca outra inserida — só admin_set_agency_classification_criteria faz UPDATE). Regra (0130): prioridade exige os DOIS mínimos (AND); fora do perfil basta QUALQUER UM dos tetos (OR); potencial futuro é o resíduo dos dois, sem limiar próprio. Volume mensal de solicitações nunca entra aqui — é só informativo (ver agency_applications.monthly_requests_volume).';

update public.agency_classification_criteria
set priority_min_team_size = 6,
    priority_min_artists = 30,
    out_of_profile_max_team_size = 1,
    out_of_profile_max_artists = 10,
    updated_at = now()
where id = (select id from public.agency_classification_criteria order by updated_at desc limit 1);

-- Recria a função de classificação com a nova regra (CREATE OR
-- REPLACE — mesma assinatura de 0129, nenhum chamador precisa mudar).
create or replace function public._classify_agency_application(
  p_team_size integer,
  p_artists_represented integer,
  p_monthly_requests_volume integer
)
returns table (classification text, snapshot jsonb)
language plpgsql
set search_path = public
as $$
declare
  v_c public.agency_classification_criteria;
  v_classification text;
begin
  select * into v_c from public.agency_classification_criteria order by updated_at desc limit 1;
  if v_c.id is null then
    raise exception 'classification_criteria_missing' using errcode = 'P0001';
  end if;

  if p_team_size >= v_c.priority_min_team_size and p_artists_represented >= v_c.priority_min_artists then
    v_classification := 'priority';
  elsif p_team_size <= v_c.out_of_profile_max_team_size or p_artists_represented <= v_c.out_of_profile_max_artists then
    v_classification := 'out_of_profile';
  else
    v_classification := 'future_potential';
  end if;

  -- p_monthly_requests_volume nunca entra na decisão acima — presente
  -- na assinatura só pra manter o registro no snapshot (análise
  -- futura), nunca eliminatório, conforme requisito explícito.
  return query select v_classification, jsonb_build_object(
    'criteria_id', v_c.id,
    'priority_min_team_size', v_c.priority_min_team_size,
    'priority_min_artists', v_c.priority_min_artists,
    'out_of_profile_max_team_size', v_c.out_of_profile_max_team_size,
    'out_of_profile_max_artists', v_c.out_of_profile_max_artists,
    'monthly_requests_volume_recorded', p_monthly_requests_volume
  );
end;
$$;

-- Recria a function admin de ajuste de critérios com a nova
-- assinatura (campos de volume mensal removidos, campos de "fora do
-- perfil" adicionados).
drop function if exists public.admin_set_agency_classification_criteria(integer, integer, integer, integer, integer, integer);

create function public.admin_set_agency_classification_criteria(
  p_priority_min_team_size integer,
  p_priority_min_artists integer,
  p_out_of_profile_max_team_size integer,
  p_out_of_profile_max_artists integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._assert_is_admin();
  v_id uuid;
  v_old jsonb;
begin
  if p_priority_min_team_size < 0 or p_priority_min_artists < 0 or p_out_of_profile_max_team_size < 0 or p_out_of_profile_max_artists < 0 then
    raise exception 'negative_threshold' using errcode = '22023';
  end if;

  select id, jsonb_build_object(
    'priority_min_team_size', priority_min_team_size, 'priority_min_artists', priority_min_artists,
    'out_of_profile_max_team_size', out_of_profile_max_team_size, 'out_of_profile_max_artists', out_of_profile_max_artists
  ) into v_id, v_old
  from public.agency_classification_criteria order by updated_at desc limit 1;

  update public.agency_classification_criteria
  set priority_min_team_size = p_priority_min_team_size,
      priority_min_artists = p_priority_min_artists,
      out_of_profile_max_team_size = p_out_of_profile_max_team_size,
      out_of_profile_max_artists = p_out_of_profile_max_artists,
      updated_by = v_admin,
      updated_at = now()
  where id = v_id;

  insert into public.admin_audit_events (admin_profile_id, action, target_table, target_id, previous_state, new_state, reason)
  values (v_admin, 'agency_classification_criteria_changed', 'agency_classification_criteria', v_id, v_old,
          jsonb_build_object('priority_min_team_size', p_priority_min_team_size, 'priority_min_artists', p_priority_min_artists,
            'out_of_profile_max_team_size', p_out_of_profile_max_team_size, 'out_of_profile_max_artists', p_out_of_profile_max_artists),
          'Ajuste de critérios de classificação pelo Admin');
end;
$$;

revoke all on function public.admin_set_agency_classification_criteria from public;
grant execute on function public.admin_set_agency_classification_criteria to authenticated;
revoke execute on function public.admin_set_agency_classification_criteria from anon;
