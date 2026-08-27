import { createClient } from '@supabase/supabase-js';

import { supabaseServiceRoleKey, supabaseUrl } from './env';
import type { Database } from './types';

// Server-only. NUNCA importar este arquivo de um client component ou
// de qualquer código que o bundler possa enviar ao browser — a
// service_role key ignora RLS por completo (BYPASSRLS). Único
// consumidor pretendido: src/lib/runtime/ (Orchestrator), que roda
// exclusivamente em rotas/handlers server-side.
//
// Client sem sessão/cookies de propósito: service_role não representa
// um usuário autenticado, é a credencial de sistema que
// is_system_caller() (migration 0051) reconhece via
// request.jwt.claims.role — a mesma chave que o PostgREST já embute
// como claim ao autenticar a conexão, nunca uma sessão gerenciada por
// @supabase/ssr (que é pra cookies de usuário, não aplicável aqui).
export function createServiceRoleClient() {
  return createClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
