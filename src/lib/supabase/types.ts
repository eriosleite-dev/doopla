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
  created_at: string;
  updated_at: string;
};

export type ArtistProfile = {
  profile_id: string;
  stage_name: string | null;
  bio: string | null;
  genres: string[];
  base_fee_cents: number | null;
  // campos de onboarding (migrados do fluxo original do site)
  intencao: string | null;
  pontual_detalhe: string | null;
  funcao: string | null;
  local: string | null;
  mercados: string | null;
  tem_booker: string | null;
  created_at: string;
  updated_at: string;
};

export type BookerProfile = {
  profile_id: string;
  company_name: string | null;
  venue_name: string | null;
  position: string | null;
  // campos de onboarding
  perfil: string | null;
  foco: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
  opportunities_seen_at: string;
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
  | 'concluida';

export type Booking = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  status: BookingStatus;
  proposed_by: UserRole;
  commission_percent: number;
  cache_amount_cents: number | null;
  description: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
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
  invitee_contact: string;
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
  created_at: string;
};

export type OpportunityStatus = 'aberta' | 'preenchida' | 'cancelada';

export type Opportunity = {
  id: string;
  artist_profile_id: string;
  description: string;
  cache_amount_cents: number | null;
  commission_percent: number;
  status: OpportunityStatus;
  created_at: string;
  updated_at: string;
};

export type OpportunityDismissal = {
  opportunity_id: string;
  booker_profile_id: string;
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
        Insert: Partial<Invite> &
          Pick<Invite, 'inviter_profile_id' | 'invitee_name' | 'invitee_contact'>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
