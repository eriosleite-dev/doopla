import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { extractBearerToken, resolveUserFromToken } from '@/lib/supabase/token-client';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

// Account closure flow (Settings V2, 08/09/2026) — espelho mobile de
// requestAccountClosureAction (src/app/dashboard/account-closure-actions.ts).
// Precisa ser uma rota real (nunca RPC chamada direto do app) pelo
// mesmo motivo estrutural do WhatsApp Identity: banir a conta e trocar
// o e-mail exigem a Admin API (service_role), segredo de servidor que
// nunca chega ao client. Reautenticação (senha) acontece aqui também,
// já que o app não tem acesso a um endpoint de reauth dedicado — mesmo
// mecanismo do lado Web (signInWithPassword contra a própria sessão).
export async function POST(request: NextRequest) {
  const accessToken = extractBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { supabase, user } = await resolveUserFromToken(accessToken);
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { password } = (body ?? {}) as { password?: unknown };
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  // Reauth — client anônimo dedicado (nunca o token client RLS-scoped
  // acima, que já carrega uma sessão): signInWithPassword aqui só
  // confirma a senha, sem afetar o token que o app já usa.
  const reauthClient = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: reauthError } = await reauthClient.auth.signInWithPassword({ email: user.email, password });
  if (reauthError) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
  }

  const { error: closeError } = await supabase.rpc('close_own_account');
  if (closeError) {
    return NextResponse.json({ error: 'close_failed' }, { status: 500 });
  }

  const serviceRole = createServiceRoleClient();
  await serviceRole.auth.admin.updateUserById(user.id, {
    email: `closed-${user.id}@closed.doopla.internal`,
    ban_duration: '876000h',
  });

  return NextResponse.json({ ok: true });
}
