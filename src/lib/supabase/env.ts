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
