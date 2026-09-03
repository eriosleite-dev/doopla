import { supabase } from '@/lib/supabase';

// Update direto sob RLS própria (profiles/artist_profiles: update own,
// migration 0001/0019) — sem regra de negócio escondida em Server
// Action pra esses campos (diferente de bookings), mesma classe seguro
// já usada em agenda_entries/payment_details.
export async function updateProfileFields(profileId: string, fields: { city?: string | null; state?: string | null }): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', profileId);
  if (error) throw error;
}

export async function updateArtistProfileFields(
  profileId: string,
  fields: { stage_name?: string | null; bio?: string | null; instagram_url?: string | null; portfolio_url?: string | null; public_enabled?: boolean }
): Promise<void> {
  const { error } = await supabase.from('artist_profiles').update(fields).eq('profile_id', profileId);
  if (error) throw error;
}
