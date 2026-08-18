// Tipos manuais para as tabelas criadas em supabase/migrations/*.sql.
// Quando o projeto Supabase estiver criado, troque por tipos gerados:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type UserRole = 'artista' | 'booker' | 'agencia';

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  slug: string | null;
  is_admin: boolean;
  referral_code: string;
  created_at: string;
  updated_at: string;
};

export type ArtistProfile = {
  profile_id: string;
  stage_name: string | null;
  bio: string | null;
  category: string | null;
  genres: string[];
  base_fee_cents: number | null;
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
  // campos de onboarding (migrados do fluxo original do site)
  intencao: string | null;
  pontual_detalhe: string | null;
  funcao: string | null;
  local: string | null;
  mercados: string | null;
  tem_booker: string | null;
  // Perfil completo (Bloco C, migration 0023)
  subcategory: string | null;
  website_url: string | null;
  other_links: string | null;
  travels: boolean;
  serves_other_locations: boolean;
  accepts_out_of_city_work: boolean;
  other_preferences: string | null;
  // Cadastro/matching estruturado (migration 0026)
  work_types: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  career_stage: string | null;
  help_areas: string[];
  fee_range: string | null;
  created_at: string;
  updated_at: string;
};

export type BookerProfile = {
  profile_id: string;
  company_name: string | null;
  venue_name: string | null;
  position: string | null;
  // campos de onboarding
  modo_trabalho: string | null;
  perfil: string | null;
  foco: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
  opportunities_seen_at: string;
  representation_request_limit: number;
  // Perfil completo (Bloco C, migration 0023)
  professional_name: string | null;
  bio: string | null;
  experience: string | null;
  instagram_url: string | null;
  // Cadastro/matching estruturado (migration 0026) — specialty_areas
  // substitui `specialties` (texto livre) como fonte usada pelo cadastro
  // e pelo Perfil; a coluna antiga `specialties` continua no banco por
  // compatibilidade, mas não é mais lida nem escrita pelo app.
  artist_categories: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  specialty_areas: string[];
  capacity: string | null;
  fee_range: string[];
  website_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyProfile = {
  profile_id: string;
  agency_name: string;
  cnpj: string | null;
  website: string | null;
  // campos de onboarding
  roster: string | null;
  agentes: string | null;
  mercado: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | 'proposta_enviada'
  | 'aceita'
  | 'recusada'
  | 'aguardando_pagamento'
  | 'concluida'
  | 'cancelada';

export type PaymentMode = 'integral_apos_trabalho' | 'sinal_saldo';
export type CancellationInitiator = 'cliente' | 'artista';
export type DisputeStatus = 'nenhuma' | 'em_disputa' | 'chargeback';

export type Booking = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  status: BookingStatus;
  proposed_by: UserRole;
  commission_percent: number;
  cache_amount_cents: number | null;
  description: string | null;
  event_date: string | null;
  validated_at: string | null;
  contract_url: string | null;
  client_name: string | null;
  client_document: string | null;
  event_location: string | null;
  created_at: string;
  updated_at: string;
  // Cancelamento/reembolso estrutural (Bloco C prioridade 2, migration 0024)
  payment_mode: PaymentMode;
  deposit_percentage: number | null;
  deposit_due_at: string | null;
  remaining_percentage: number | null;
  remaining_due_rule: string | null;
  client_cancellation_deposit_refundable: boolean;
  artist_cancellation_deposit_refundable: boolean;
  cancellation_policy_version: string;
  cancellation_terms_accepted_at: string | null;
  cancellation_terms_accepted_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_initiator: CancellationInitiator | null;
  cancellation_reason: string | null;
  original_event_date: string | null;
  rescheduled_event_date: string | null;
  rescheduled_at: string | null;
  reschedule_accepted_by: string | null;
  reschedule_proposed_date: string | null;
  reschedule_proposed_by: string | null;
  payment_due_at: string | null;
  payment_collection_started_at: string | null;
  dispute_status: DisputeStatus;
  dispute_opened_at: string | null;
};

export type BookingEvent = {
  id: string;
  booking_id: string;
  actor_profile_id: string;
  event_type: string;
  commission_percent: number | null;
  note: string | null;
  created_at: string;
};

export type InviteStatus = 'pendente' | 'confirmado';

export type Invite = {
  id: string;
  inviter_profile_id: string;
  invitee_name: string;
  invitee_contact: string | null;
  invitee_profile_id: string | null;
  status: InviteStatus;
  token: string;
  created_at: string;
  confirmed_at: string | null;
};

export type Representation = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  created_via_invite_id: string | null;
  created_via_representation_request_id: string | null;
  created_at: string;
};

// Bloco 4.5 — jornada de publicação da oportunidade (nunca o andamento do
// trabalho, isso é BookingStatus). 'rascunho' reservado, nada usa ainda.
export type OpportunityStatus =
  | 'rascunho'
  | 'aberta'
  | 'em_distribuicao'
  | 'interesse_recebido'
  | 'booker_selecionado'
  | 'cancelada';

export type OpportunityDistributionMode = 'meus_bookers' | 'novos_bookers' | 'ambos';

export type OpportunitySource = 'mural' | 'artist_link';
export type OpportunityAssignedTo = 'artist' | 'booker' | 'shared';

export type Opportunity = {
  id: string;
  artist_profile_id: string;
  description: string;
  cache_amount_cents: number | null;
  commission_percent: number | null;
  status: OpportunityStatus;
  distribution_mode: OpportunityDistributionMode;
  work_type: string | null;
  category: string | null;
  location: string | null;
  event_date: string | null;
  cache_min_cents: number | null;
  cache_max_cents: number | null;
  selected_booker_id: string | null;
  selected_at: string | null;
  ai_tags_status: 'pendente' | 'concluido' | 'falhou';
  ai_tags_content_hash: string | null;
  ai_tags_processed_at: string | null;
  // Bloco C — /orçamento (migration 0023)
  source: OpportunitySource;
  assigned_to: OpportunityAssignedTo | null;
  client_name: string | null;
  client_contact: string | null;
  client_offered_cents: number | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityDismissal = {
  opportunity_id: string;
  booker_profile_id: string;
  created_at: string;
};

// Bloco 4.5 — booker pede pra representar um artista novo (distinto de
// Invite, que é pra relação que já existe fora da doopla).
export type RepresentationRequestStatus = 'pendente' | 'aceita' | 'recusada' | 'expirada';

export type RepresentationRequest = {
  id: string;
  booker_profile_id: string;
  artist_profile_id: string;
  message: string | null;
  status: RepresentationRequestStatus;
  expires_at: string;
  responded_at: string | null;
  booker_seen_at: string | null;
  created_at: string;
};

export type OpportunityInvitationStatus = 'pendente' | 'aceita' | 'recusada' | 'encerrada';

export type OpportunityInvitation = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string;
  status: OpportunityInvitationStatus;
  created_at: string;
  responded_at: string | null;
};

export type OpportunityInterestStatus = 'pendente' | 'selecionado' | 'encerrado';

export type OpportunityInterest = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string;
  status: OpportunityInterestStatus;
  created_at: string;
};

export type OpportunityEvent = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string | null;
  event_type: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type OpportunityTagSource = 'explicit' | 'ai';

export type OpportunityTag = {
  id: string;
  opportunity_id: string;
  tag: string;
  source: OpportunityTagSource;
  created_at: string;
};

export type AiUsageEvent = {
  id: string;
  profile_id: string | null;
  opportunity_id: string | null;
  feature: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents_estimate: number | null;
  created_at: string;
};

export type ArtistAvailability = {
  id: string;
  artist_profile_id: string;
  available_date: string;
  created_at: string;
};

export type PayoutRequestStatus = 'solicitado';

export type PayoutRequest = {
  id: string;
  profile_id: string;
  amount_cents: number;
  status: PayoutRequestStatus;
  created_at: string;
};

export type LinkRoutingMode = 'eu' | 'meu_booker' | 'eu_e_meu_booker';

export type ArtistLinkRouting = {
  id: string;
  artist_id: string;
  mode: LinkRoutingMode;
  booker_id: string | null;
  updated_at: string;
};

// "Indique. Ganhe R$5." — status fica em 'pendente' até existir sistema de
// assinatura real pra checar 45-60 dias de assinatura ativa do indicado.
// Nenhum caminho automático pra 'qualificada' existe ainda (ver migration
// 0020). 'invalida' reservado pra moderação futura (fraude/abuso).
export type ReferralStatus = 'pendente' | 'qualificada' | 'invalida';

export type Referral = {
  id: string;
  referrer_profile_id: string;
  referred_profile_id: string;
  code: string;
  status: ReferralStatus;
  bonus_cents: number;
  qualified_at: string | null;
  created_at: string;
};

// Gerador de contrato — snapshot imutável. `content` é o texto final das
// cláusulas liberadas (escopo/partes/evento) no momento da geração;
// `pendente` lista os módulos ainda não cobertos (pagamento, cancelamento),
// travados até a validação Pagar.me/jurídica.
export type ContractContent = {
  escopo: string;
  partes: string;
  evento: string;
  pendente: string[];
};

export type BookingContract = {
  id: string;
  booking_id: string;
  template_version: string;
  generated_by_profile_id: string;
  content: ContractContent;
  created_at: string;
};

export type ReviewStatus = 'pendente' | 'ativa' | 'removida' | 'invalidada';

export type Review = {
  id: string;
  booking_id: string;
  reviewer_profile_id: string;
  reviewee_profile_id: string;
  rating: number | null;
  attributes: string[];
  comment: string | null;
  status: ReviewStatus;
  contested: boolean;
  requested_at: string | null;
  submitted_at: string | null;
  edited_at: string | null;
  created_at: string;
};

// A lib do Supabase exige `Relationships` em cada tabela (usado só pra
// joins embutidos via .select('foo(*)')). Não usamos essa sintaxe — as
// junções são feitas com queries separadas — então fica sempre [].
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'role' | 'full_name'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      artist_profiles: {
        Row: ArtistProfile;
        Insert: Partial<ArtistProfile> & Pick<ArtistProfile, 'profile_id'>;
        Update: Partial<ArtistProfile>;
        Relationships: [];
      };
      booker_profiles: {
        Row: BookerProfile;
        Insert: Partial<BookerProfile> & Pick<BookerProfile, 'profile_id'>;
        Update: Partial<BookerProfile>;
        Relationships: [];
      };
      agency_profiles: {
        Row: AgencyProfile;
        Insert: Partial<AgencyProfile> &
          Pick<AgencyProfile, 'profile_id' | 'agency_name'>;
        Update: Partial<AgencyProfile>;
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: Partial<Booking> &
          Pick<
            Booking,
            'artist_profile_id' | 'booker_profile_id' | 'proposed_by' | 'commission_percent'
          >;
        Update: Partial<Booking>;
        Relationships: [];
      };
      booking_events: {
        Row: BookingEvent;
        Insert: Partial<BookingEvent> &
          Pick<BookingEvent, 'booking_id' | 'actor_profile_id' | 'event_type'>;
        Update: Partial<BookingEvent>;
        Relationships: [];
      };
      invites: {
        Row: Invite;
        Insert: Partial<Invite> & Pick<Invite, 'inviter_profile_id' | 'invitee_name'>;
        Update: Partial<Invite>;
        Relationships: [];
      };
      representations: {
        Row: Representation;
        Insert: Partial<Representation> &
          Pick<Representation, 'artist_profile_id' | 'booker_profile_id'>;
        Update: Partial<Representation>;
        Relationships: [];
      };
      opportunities: {
        Row: Opportunity;
        Insert: Partial<Opportunity> &
          Pick<Opportunity, 'artist_profile_id' | 'description' | 'commission_percent'>;
        Update: Partial<Opportunity>;
        Relationships: [];
      };
      opportunity_dismissals: {
        Row: OpportunityDismissal;
        Insert: Partial<OpportunityDismissal> &
          Pick<OpportunityDismissal, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityDismissal>;
        Relationships: [];
      };
      representation_requests: {
        Row: RepresentationRequest;
        Insert: Partial<RepresentationRequest> &
          Pick<RepresentationRequest, 'booker_profile_id' | 'artist_profile_id'>;
        Update: Partial<RepresentationRequest>;
        Relationships: [];
      };
      opportunity_invitations: {
        Row: OpportunityInvitation;
        Insert: Partial<OpportunityInvitation> &
          Pick<OpportunityInvitation, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityInvitation>;
        Relationships: [];
      };
      opportunity_interests: {
        Row: OpportunityInterest;
        Insert: Partial<OpportunityInterest> &
          Pick<OpportunityInterest, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityInterest>;
        Relationships: [];
      };
      opportunity_events: {
        Row: OpportunityEvent;
        Insert: Partial<OpportunityEvent> & Pick<OpportunityEvent, 'opportunity_id'>;
        Update: Partial<OpportunityEvent>;
        Relationships: [];
      };
      opportunity_tags: {
        Row: OpportunityTag;
        Insert: Partial<OpportunityTag> & Pick<OpportunityTag, 'opportunity_id' | 'tag' | 'source'>;
        Update: Partial<OpportunityTag>;
        Relationships: [];
      };
      ai_usage_events: {
        Row: AiUsageEvent;
        Insert: Partial<AiUsageEvent> & Pick<AiUsageEvent, 'feature'>;
        Update: Partial<AiUsageEvent>;
        Relationships: [];
      };
      artist_availability: {
        Row: ArtistAvailability;
        Insert: Partial<ArtistAvailability> &
          Pick<ArtistAvailability, 'artist_profile_id' | 'available_date'>;
        Update: Partial<ArtistAvailability>;
        Relationships: [];
      };
      payout_requests: {
        Row: PayoutRequest;
        Insert: Partial<PayoutRequest> & Pick<PayoutRequest, 'profile_id' | 'amount_cents'>;
        Update: Partial<PayoutRequest>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Partial<Review> &
          Pick<Review, 'booking_id' | 'reviewer_profile_id' | 'reviewee_profile_id'>;
        Update: Partial<Review>;
        Relationships: [];
      };
      referrals: {
        Row: Referral;
        Insert: Partial<Referral> &
          Pick<Referral, 'referrer_profile_id' | 'referred_profile_id' | 'code'>;
        Update: Partial<Referral>;
        Relationships: [];
      };
      booking_contracts: {
        Row: BookingContract;
        Insert: Partial<BookingContract> &
          Pick<BookingContract, 'booking_id' | 'template_version' | 'generated_by_profile_id' | 'content'>;
        Update: Partial<BookingContract>;
        Relationships: [];
      };
      artist_link_routing: {
        Row: ArtistLinkRouting;
        Insert: Partial<ArtistLinkRouting> & Pick<ArtistLinkRouting, 'artist_id'>;
        Update: Partial<ArtistLinkRouting>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      select_booker_for_opportunity: {
        Args: { p_opportunity_id: string; p_booker_profile_id: string };
        Returns: Opportunity;
      };
      expire_stale_representation_requests: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      submit_orcamento_request: {
        Args: {
          p_artist_slug: string;
          p_description: string;
          p_client_name: string;
          p_client_contact: string;
          p_event_date: string | null;
          p_location: string | null;
          p_offered_cents: number | null;
        };
        Returns: string;
      };
    };
  };
};
