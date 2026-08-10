// Tipos manuais para as tabelas criadas em supabase/migrations/*.sql.
// Quando o projeto Supabase estiver criado, troque por tipos gerados:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type UserRole = 'artista' | 'booker' | 'agencia';

export interface Profile {
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
}

export interface ArtistProfile {
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
}

export interface BookerProfile {
  profile_id: string;
  company_name: string | null;
  venue_name: string | null;
  position: string | null;
  // campos de onboarding
  perfil: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyProfile {
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
}

export type BookingStatus =
  | 'proposta_enviada'
  | 'aceita'
  | 'recusada'
  | 'aguardando_pagamento'
  | 'concluida';

export interface Booking {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  status: BookingStatus;
  proposed_by: UserRole;
  commission_percent: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingEvent {
  id: string;
  booking_id: string;
  actor_profile_id: string;
  event_type: string;
  commission_percent: number | null;
  note: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'role' | 'full_name'>;
        Update: Partial<Profile>;
      };
      artist_profiles: {
        Row: ArtistProfile;
        Insert: Partial<ArtistProfile> & Pick<ArtistProfile, 'profile_id'>;
        Update: Partial<ArtistProfile>;
      };
      booker_profiles: {
        Row: BookerProfile;
        Insert: Partial<BookerProfile> & Pick<BookerProfile, 'profile_id'>;
        Update: Partial<BookerProfile>;
      };
      agency_profiles: {
        Row: AgencyProfile;
        Insert: Partial<AgencyProfile> &
          Pick<AgencyProfile, 'profile_id' | 'agency_name'>;
        Update: Partial<AgencyProfile>;
      };
      bookings: {
        Row: Booking;
        Insert: Partial<Booking> &
          Pick<
            Booking,
            'artist_profile_id' | 'booker_profile_id' | 'proposed_by' | 'commission_percent'
          >;
        Update: Partial<Booking>;
      };
      booking_events: {
        Row: BookingEvent;
        Insert: Partial<BookingEvent> &
          Pick<BookingEvent, 'booking_id' | 'actor_profile_id' | 'event_type'>;
        Update: Partial<BookingEvent>;
      };
    };
  };
}
