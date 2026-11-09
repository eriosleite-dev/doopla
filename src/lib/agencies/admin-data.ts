import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AgencyApplicationDetail,
  AgencyApplicationHistoryEntry,
  AgencyApplicationListFilters,
  AgencyApplicationSummary,
  AgencyClassificationCriteria,
  AgencyNotificationRecipient,
} from './types';

// Doopla — Admin > Agências Parceiras. Wrappers finos sobre as RPCs
// admin_* de agências (migration 0129) — toda autorização é checada
// de novo dentro de cada function (_assert_is_admin), nunca confiada
// só no boundary de /admin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

function mapApplicationRow(row: Record<string, unknown>): AgencyApplicationSummary {
  return {
    id: row.id as string,
    agencyName: row.agency_name as string,
    websiteOrInstagram: row.website_or_instagram as string,
    city: row.city as string,
    country: row.country as string,
    contactName: row.contact_name as string,
    contactRole: row.contact_role as string | null,
    contactEmail: row.contact_email as string,
    teamSize: row.team_size as number,
    artistsRepresented: row.artists_represented as number,
    monthlyRequestsVolume: row.monthly_requests_volume as number,
    interest: row.interest as AgencyApplicationSummary['interest'],
    classification: row.classification as AgencyApplicationSummary['classification'],
    status: row.status as AgencyApplicationSummary['status'],
    notificationStatus: row.notification_status as AgencyApplicationSummary['notificationStatus'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listAgencyApplications(
  supabase: AnySupabaseClient,
  filters: AgencyApplicationListFilters
): Promise<AgencyApplicationSummary[]> {
  const { data, error } = await supabase.rpc('admin_list_agency_applications', {
    p_classification: filters.classification ?? null,
    p_status: filters.status ?? null,
    p_min_team_size: filters.minTeamSize ?? null,
    p_min_artists: filters.minArtists ?? null,
    p_city: filters.city ?? null,
    p_country: filters.country ?? null,
    p_interest: filters.interest ?? null,
    p_query: filters.query ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_limit: filters.limit ?? 50,
  });
  if (error) throw new Error(`admin_list_agency_applications falhou: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapApplicationRow);
}

export async function getAgencyApplication(supabase: AnySupabaseClient, id: string): Promise<AgencyApplicationDetail | null> {
  const { data, error } = await supabase.rpc('admin_get_agency_application', { p_id: id }).single();
  if (error) throw new Error(`admin_get_agency_application falhou: ${error.message}`);
  const row = data as Record<string, unknown> | null;
  if (!row || !row.id) return null;
  return {
    ...mapApplicationRow(row),
    classificationSnapshot: row.classification_snapshot as Record<string, number | string>,
    consentContactAt: row.consent_contact_at as string,
    notificationError: (row.notification_error as string | null) ?? null,
    notifiedAt: (row.notified_at as string | null) ?? null,
  };
}

export async function setAgencyApplicationStatus(
  supabase: AnySupabaseClient,
  params: { id: string; status: string; reason: string }
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_agency_application_status', {
    p_id: params.id,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw new Error(`admin_set_agency_application_status falhou: ${error.message}`);
}

export async function addAgencyApplicationNote(supabase: AnySupabaseClient, params: { id: string; note: string }): Promise<void> {
  const { error } = await supabase.rpc('admin_add_agency_application_note', { p_id: params.id, p_note: params.note });
  if (error) throw new Error(`admin_add_agency_application_note falhou: ${error.message}`);
}

export async function listAgencyApplicationHistory(supabase: AnySupabaseClient, id: string): Promise<AgencyApplicationHistoryEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_agency_application_history', { p_id: id });
  if (error) throw new Error(`admin_list_agency_application_history falhou: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    adminProfileId: row.admin_profile_id as string,
    adminName: row.admin_name as string,
    action: row.action as string,
    previousState: row.previous_state as Record<string, unknown> | null,
    newState: row.new_state as Record<string, unknown> | null,
    reason: row.reason as string,
    createdAt: row.created_at as string,
  }));
}

export async function getAgencyClassificationCriteria(supabase: AnySupabaseClient): Promise<AgencyClassificationCriteria> {
  const { data, error } = await supabase.rpc('admin_get_agency_classification_criteria').single();
  if (error) throw new Error(`admin_get_agency_classification_criteria falhou: ${error.message}`);
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    priorityMinTeamSize: row.priority_min_team_size as number,
    priorityMinArtists: row.priority_min_artists as number,
    outOfProfileMaxTeamSize: row.out_of_profile_max_team_size as number,
    outOfProfileMaxArtists: row.out_of_profile_max_artists as number,
    updatedAt: row.updated_at as string,
  };
}

export async function setAgencyClassificationCriteria(
  supabase: AnySupabaseClient,
  params: {
    priorityMinTeamSize: number;
    priorityMinArtists: number;
    outOfProfileMaxTeamSize: number;
    outOfProfileMaxArtists: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_agency_classification_criteria', {
    p_priority_min_team_size: params.priorityMinTeamSize,
    p_priority_min_artists: params.priorityMinArtists,
    p_out_of_profile_max_team_size: params.outOfProfileMaxTeamSize,
    p_out_of_profile_max_artists: params.outOfProfileMaxArtists,
  });
  if (error) throw new Error(`admin_set_agency_classification_criteria falhou: ${error.message}`);
}

export async function listAgencyNotificationRecipients(supabase: AnySupabaseClient): Promise<AgencyNotificationRecipient[]> {
  const { data, error } = await supabase.rpc('admin_list_agency_notification_recipients');
  if (error) throw new Error(`admin_list_agency_notification_recipients falhou: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    active: row.active as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function addAgencyNotificationRecipient(supabase: AnySupabaseClient, email: string): Promise<void> {
  const { error } = await supabase.rpc('admin_add_agency_notification_recipient', { p_email: email });
  if (error) throw new Error(`admin_add_agency_notification_recipient falhou: ${error.message}`);
}

export async function removeAgencyNotificationRecipient(supabase: AnySupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_agency_notification_recipient', { p_id: id });
  if (error) throw new Error(`admin_remove_agency_notification_recipient falhou: ${error.message}`);
}

export async function resetAgencyNotification(supabase: AnySupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_agency_notification', { p_id: id });
  if (error) throw new Error(`admin_reset_agency_notification falhou: ${error.message}`);
}

export async function getAgencyFunnelSummary(supabase: AnySupabaseClient, days = 7): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('admin_get_agency_funnel_summary', { p_days: days });
  if (error) throw new Error(`admin_get_agency_funnel_summary falhou: ${error.message}`);
  const result: Record<string, number> = {};
  for (const row of (data ?? []) as { event_type: string; total: number }[]) {
    result[row.event_type] = Number(row.total);
  }
  return result;
}

export async function getAgencyApplicationsWeeklySummary(supabase: AnySupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('admin_get_agency_applications_weekly_summary');
  if (error) throw new Error(`admin_get_agency_applications_weekly_summary falhou: ${error.message}`);
  const result: Record<string, number> = {};
  for (const row of (data ?? []) as { classification: string; total: number }[]) {
    result[row.classification] = Number(row.total);
  }
  return result;
}
