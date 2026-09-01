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

// Canal WhatsApp (passo 6A+6B) — todas server-only, nunca
// NEXT_PUBLIC_. Lidas só por src/lib/channels/whatsapp/ e pelas rotas
// de webhook/sender (src/app/api/whatsapp/, src/app/api/runtime/
// send-outbound-intents).
export const whatsappAccessToken = () => requireEnv('WHATSAPP_ACCESS_TOKEN');
export const whatsappPhoneNumberId = () => requireEnv('WHATSAPP_PHONE_NUMBER_ID');
export const whatsappAppSecret = () => requireEnv('WHATSAPP_APP_SECRET');
export const whatsappWebhookVerifyToken = () => requireEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
