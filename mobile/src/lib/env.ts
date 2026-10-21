// Doopla Mobile — leitura de variáveis de ambiente. Mesmo espírito do
// requireEnv() do painel web (src/lib/supabase/env.ts): falha alto e
// cedo com mensagem clara, nunca deixa undefined vazar silenciosamente
// pro resto do app.
//
// No Expo, só variáveis prefixadas EXPO_PUBLIC_ ficam disponíveis em
// process.env dentro do bundle do app (mesmo racional do NEXT_PUBLIC_
// no Next.js) — nunca colocar segredo real aqui, só valores já
// pensados pra ficar no cliente (ex.: URL do projeto Supabase, anon
// key, que já são públicos por design no lado do banco via RLS).
//
// Nenhum client de Supabase é montado aqui ainda — só a leitura das
// variáveis, preparado para quando a integração for autorizada.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não definida. Copie .env.example para .env e preencha.`);
  }
  return value;
}

export const supabaseUrl = () => requireEnv('EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = () => requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

// Conversas Bloco 2 — base URL do painel web (Next.js), único server
// real que o Mobile tem pra escritas que precisam de service_role
// (submitProfessionalReply -> Runtime). Nunca usado pra leitura — toda
// leitura do Mobile continua direto no Supabase via RLS, mesmo client
// de sempre (supabase.ts).
export const apiBaseUrl = () => requireEnv('EXPO_PUBLIC_API_BASE_URL');

// Professional Product UI — Foundation. Mesmo número público usado no
// Web (NEXT_PUBLIC_WHATSAPP_NUMBER, src/app/orcamento/[slug]/page.tsx)
// — nunca um número por profissional, valor já público (aparece no
// HTML de qualquer página /orcamento/[slug]), nunca um segredo.
export const dooplaWhatsappNumber = () => requireEnv('EXPO_PUBLIC_WHATSAPP_NUMBER');
