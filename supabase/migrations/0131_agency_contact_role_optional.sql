-- Doopla — Qualificação de agências: campo "Cargo" (contact_role)
-- deixa de ser obrigatório (pedido explícito da fundadora, parte da
-- reordenação de etapas pra reduzir fricção). Migration aditiva/
-- substitutiva sobre 0129/0130 — nunca edita os arquivos já aplicados.

alter table public.agency_applications alter column contact_role drop not null;

comment on column public.agency_applications.contact_role is 'Opcional desde 0131 — campo de menor fricção, a agência pode deixar em branco.';

-- Recria submit_agency_application sem exigir contact_role (mesma
-- assinatura de 0129, CREATE OR REPLACE — nenhum chamador precisa
-- mudar). Todo o resto do corpo é idêntico ao de 0129.
create or replace function public.submit_agency_application(
  p_agency_name text,
  p_website_or_instagram text,
  p_city text,
  p_country text,
  p_contact_name text,
  p_contact_role text,
  p_contact_email text,
  p_team_size integer,
  p_artists_represented integer,
  p_monthly_requests_volume integer,
  p_interest text,
  p_consent boolean
)
returns table (id uuid, classification text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_contact_email));
  v_contact_role text := nullif(trim(coalesce(p_contact_role, '')), '');
  v_existing_id uuid;
  v_recent_count integer;
  v_result record;
  v_new_id uuid;
begin
  if coalesce(trim(p_agency_name), '') = '' then raise exception 'agency_name_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_website_or_instagram), '') = '' then raise exception 'website_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_city), '') = '' then raise exception 'city_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_country), '') = '' then raise exception 'country_required' using errcode = 'P0001'; end if;
  if coalesce(trim(p_contact_name), '') = '' then raise exception 'contact_name_required' using errcode = 'P0001'; end if;
  if v_email = '' then raise exception 'email_required' using errcode = 'P0001'; end if;
  if p_team_size is null or p_team_size <= 0 then raise exception 'team_size_invalid' using errcode = 'P0001'; end if;
  if p_artists_represented is null or p_artists_represented < 0 then raise exception 'artists_represented_invalid' using errcode = 'P0001'; end if;
  if p_monthly_requests_volume is null or p_monthly_requests_volume < 0 then raise exception 'monthly_requests_volume_invalid' using errcode = 'P0001'; end if;
  if p_interest not in ('discovery_metrics', 'recurring_revenue', 'both') then raise exception 'interest_invalid' using errcode = 'P0001'; end if;
  if p_consent is not true then raise exception 'consent_required' using errcode = 'P0001'; end if;

  select a.id into v_existing_id from public.agency_applications a where a.contact_email = v_email;

  if v_existing_id is null then
    select count(*) into v_recent_count
    from public.agency_applications
    where created_at > now() - interval '10 minutes';
    if v_recent_count >= 20 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  select * into v_result from public._classify_agency_application(p_team_size, p_artists_represented, p_monthly_requests_volume);

  if v_existing_id is not null then
    update public.agency_applications
    set agency_name = trim(p_agency_name),
        website_or_instagram = trim(p_website_or_instagram),
        city = trim(p_city),
        country = trim(p_country),
        contact_name = trim(p_contact_name),
        contact_role = v_contact_role,
        team_size = p_team_size,
        artists_represented = p_artists_represented,
        monthly_requests_volume = p_monthly_requests_volume,
        interest = p_interest,
        classification = v_result.classification,
        classification_snapshot = v_result.snapshot,
        consent_contact_at = now(),
        notification_status = case when v_result.classification = 'priority' then 'pending' else 'not_applicable' end,
        notification_error = null,
        notified_at = null,
        updated_at = now()
    where agency_applications.id = v_existing_id
    returning agency_applications.id into v_new_id;

    return query select v_new_id, v_result.classification;
    return;
  end if;

  insert into public.agency_applications (
    agency_name, website_or_instagram, city, country, contact_name, contact_role, contact_email,
    team_size, artists_represented, monthly_requests_volume, interest,
    classification, classification_snapshot, consent_contact_at, notification_status
  ) values (
    trim(p_agency_name), trim(p_website_or_instagram), trim(p_city), trim(p_country), trim(p_contact_name), v_contact_role, v_email,
    p_team_size, p_artists_represented, p_monthly_requests_volume, p_interest,
    v_result.classification, v_result.snapshot, now(),
    case when v_result.classification = 'priority' then 'pending' else 'not_applicable' end
  )
  returning agency_applications.id into v_new_id;

  return query select v_new_id, v_result.classification;
  return;
end;
$$;

revoke all on function public.submit_agency_application from public;
grant execute on function public.submit_agency_application to anon, authenticated;
