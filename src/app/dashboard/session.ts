import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { ensurePublicId } from '@/lib/public-id';
import type { Profile } from '@/lib/supabase/types';

// cache() dedupe: layout.tsx e a page de cada rota chamam isso no mesmo
// request, mas só bate no Supabase uma vez.
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile) {
    redirect('/login?next=/dashboard');
  }

  // Todo profile ganha um ID público estável (profiles.slug) na
  // primeira visita ao painel, não só artista — ver ensurePublicId.
  // Nome-base por papel: artista usa stage_name (perfil de palco),
  // booker usa company_name (identidade profissional dela), ambos com
  // fallback pro full_name.
  if (!profile.slug) {
    let nameHint = profile.full_name;
    if (profile.role === 'artista') {
      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('stage_name')
        .eq('profile_id', user.id)
        .maybeSingle<{ stage_name: string | null }>();
      nameHint = artist?.stage_name || profile.full_name;
    } else if (profile.role === 'booker') {
      const { data: booker } = await supabase
        .from('booker_profiles')
        .select('company_name')
        .eq('profile_id', user.id)
        .maybeSingle<{ company_name: string | null }>();
      nameHint = booker?.company_name || profile.display_name || profile.full_name;
    }
    profile.slug = await ensurePublicId(supabase, user.id, nameHint);
  }

  return { supabase, user, profile };
});
