import { supabase } from '@/lib/supabase';
import type { ArtistProfile, ArtistSubscription } from '@/types/artistProfile';

export async function fetchArtistProfile(profileId: string): Promise<ArtistProfile | null> {
  const { data, error } = await supabase
    .from('artist_profiles')
    .select('profile_id, stage_name, category, bio, genres, work_types, public_enabled, instagram_url, portfolio_url')
    .eq('profile_id', profileId)
    .maybeSingle<ArtistProfile>();
  if (error) throw error;
  return data;
}

export async function fetchArtistSubscription(profileId: string): Promise<ArtistSubscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('profile_id, role, status, artist_plan, trial_ends_at')
    .eq('profile_id', profileId)
    .maybeSingle<ArtistSubscription>();
  if (error) throw error;
  return data;
}
