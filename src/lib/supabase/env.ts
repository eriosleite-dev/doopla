function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ${name} não definida. Copie .env.local.example para .env.local e preencha com os dados do seu projeto Supabase.`
    );
  }
  return value;
}

export const supabaseUrl = () => requireEnv('NEXT_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = () =>
  requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// Server-only — nunca prefixado com NEXT_PUBLIC_ (bundlers Next.js só
// inlinam env vars com esse prefixo pro browser; sem ele, a variável
// só existe no processo Node do servidor). Lido só por
// src/lib/supabase/service-role.ts.
export const supabaseServiceRoleKey = () => requireEnv('SUPABASE_SERVICE_ROLE_KEY');
