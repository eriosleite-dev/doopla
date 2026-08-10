import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { supabaseAnonKey, supabaseUrl } from './env';
import type { Database } from './types';

// Use em Server Components, Server Actions e Route Handlers.
// Em Server Components (sem permissão de escrever cookies) o `setAll`
// pode falhar silenciosamente — nesse caso a sessão é renovada pelo proxy.ts.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Chamado a partir de um Server Component — ignorado porque
          // o proxy.ts já cuida de manter a sessão renovada.
        }
      },
    },
  });
}
