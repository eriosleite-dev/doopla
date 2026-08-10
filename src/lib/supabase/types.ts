// Tipos manuais para as tabelas criadas em supabase/migrations/0001_init_auth_profiles.sql.
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
  created_at: string;
  updated_at: string;
}

export interface BookerProfile {
  profile_id: string;
  company_name: string | null;
  venue_name: string | null;
  position: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyProfile {
  profile_id: string;
  agency_name: string;
  cnpj: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
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
    };
  };
}
