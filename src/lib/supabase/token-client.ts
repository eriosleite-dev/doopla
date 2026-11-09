import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from './env';
import type { Database } from './types';

// Server-only — rotas de API (src/app/api/mobile/**) consumidas pelo
// app Mobile/Expo. Mobile não tem cookies HTTP (createClient de
// server.ts, baseado em @supabase/ssr + next/headers, não se aplica
// aqui) — a sessão chega como Bearer token no header Authorization
// (mobile/src/lib/supabase.ts já mantém uma sessão real de usuário,
// mesmo projeto/RLS de sempre). Este client representa o USUÁRIO real
// dono do token, NUNCA service_role — RLS se aplica normalmente, exatamente
// como um client de cookie aplicaria; só o transporte da credencial
// muda. Nunca usar isto pra decidir autorização por si só: cada rota
// ainda precisa resolver auth.getUser() e comparar contra o
// professional_id que ela mesma espera, mesmo padrão de
// requireProfessional() do painel web.
export function createTokenClient(accessToken: string) {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Extrai "Bearer <token>" do header Authorization — null quando
// ausente/malformado (a rota chamadora decide o 401, nunca esta
// função, que só faz parsing).
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  return match ? match[1] : null;
}

// Resolve o usuário real a partir do token — NUNCA confia em nenhum
// valor de professional_id vindo do corpo/query da requisição:
// auth.getUser() valida o JWT contra o Auth server a cada chamada.
export async function resolveUserFromToken(accessToken: string) {
  const supabase = createTokenClient(accessToken);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
