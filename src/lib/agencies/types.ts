// Doopla — Fluxo de qualificação de agências. Tipos compartilhados
// entre o formulário público (Home) e o Admin ("Agências Parceiras").
// Espelham exatamente os CHECKs de agency_applications (migration
// 0129) — nunca um vocabulário próprio divergente do banco.

export const AGENCY_INTERESTS = ['discovery_metrics', 'recurring_revenue', 'both'] as const;
export type AgencyInterest = (typeof AGENCY_INTERESTS)[number];

export const AGENCY_CLASSIFICATIONS = ['priority', 'future_potential', 'out_of_profile'] as const;
export type AgencyClassification = (typeof AGENCY_CLASSIFICATIONS)[number];

export const AGENCY_STATUSES = ['new', 'under_review', 'contacted', 'in_conversation', 'partner', 'rejected', 'archived'] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

export const AGENCY_NOTIFICATION_STATUSES = ['not_applicable', 'pending', 'sent', 'failed'] as const;
export type AgencyNotificationStatus = (typeof AGENCY_NOTIFICATION_STATUSES)[number];

export type AgencyApplicationSummary = {
  id: string;
  agencyName: string;
  websiteOrInstagram: string;
  city: string;
  country: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  teamSize: number;
  artistsRepresented: number;
  monthlyRequestsVolume: number;
  interest: AgencyInterest;
  classification: AgencyClassification;
  status: AgencyStatus;
  notificationStatus: AgencyNotificationStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgencyApplicationDetail = AgencyApplicationSummary & {
  classificationSnapshot: Record<string, number | string>;
  consentContactAt: string;
  notificationError: string | null;
  notifiedAt: string | null;
};

export type AgencyApplicationHistoryEntry = {
  id: string;
  adminProfileId: string;
  adminName: string;
  action: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string;
  createdAt: string;
};

export type AgencyClassificationCriteria = {
  id: string;
  priorityMinTeamSize: number;
  priorityMinArtists: number;
  outOfProfileMaxTeamSize: number;
  outOfProfileMaxArtists: number;
  updatedAt: string;
};

export type AgencyNotificationRecipient = {
  id: string;
  email: string;
  active: boolean;
  createdAt: string;
};

export type AgencyApplicationListFilters = {
  classification?: AgencyClassification;
  status?: AgencyStatus;
  minTeamSize?: number;
  minArtists?: number;
  city?: string;
  country?: string;
  interest?: AgencyInterest;
  query?: string;
  from?: string;
  to?: string;
  limit?: number;
};
