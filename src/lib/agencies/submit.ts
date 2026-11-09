import type { SupabaseClient } from '@supabase/supabase-js';

import type { AgencyClassification, AgencyInterest } from './types';

// Doopla — único caminho de escrita do formulário público de
// qualificação de agências (3 etapas, Home). Wrapper fino sobre
// submit_agency_application (migration 0129) — toda validação de
// negócio/dedup/rate-limit/classificação vive no banco, nunca aqui.

export type SubmitAgencyApplicationInput = {
  agencyName: string;
  websiteOrInstagram: string;
  city: string;
  country: string;
  contactName: string;
  contactRole: string | null;
  contactEmail: string;
  teamSize: number;
  artistsRepresented: number;
  monthlyRequestsVolume: number;
  interest: AgencyInterest;
  consent: boolean;
};

export type SubmitAgencyApplicationResult =
  | { ok: true; id: string; classification: AgencyClassification }
  | { ok: false; error: string };

export async function submitAgencyApplication(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: SubmitAgencyApplicationInput
): Promise<SubmitAgencyApplicationResult> {
  const { data, error } = await supabase
    .rpc('submit_agency_application', {
      p_agency_name: input.agencyName,
      p_website_or_instagram: input.websiteOrInstagram,
      p_city: input.city,
      p_country: input.country,
      p_contact_name: input.contactName,
      p_contact_role: input.contactRole,
      p_contact_email: input.contactEmail,
      p_team_size: input.teamSize,
      p_artists_represented: input.artistsRepresented,
      p_monthly_requests_volume: input.monthlyRequestsVolume,
      p_interest: input.interest,
      p_consent: input.consent,
    })
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as { id: string; classification: AgencyClassification };
  return { ok: true, id: row.id, classification: row.classification };
}
