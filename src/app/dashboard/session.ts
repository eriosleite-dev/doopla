import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
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

  return { supabase, user, profile };
});
