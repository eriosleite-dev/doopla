import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Nunca gerar um ID igual a uma rota real do site.
const RESERVED_SLUGS = new Set([
  'ajuda',
  'auth',
  'cadastro',
  'dashboard',
  'login',
  'precos',
  'privacidade',
  'seguranca',
  'sobre',
  'termos',
  'api',
]);

// Identificador público estável de `profiles.slug` (07/09/2026) — até
// aqui só existia pra artista, gerado sob demanda quando ativava o
// link de orçamento público (/[slug], ver enablePublicProfileAction em
// dashboard/actions.ts). Extraído pra cá e generalizado pra QUALQUER
// papel, chamado de getSessionProfile() (dashboard/session.ts) na
// primeira visita ao painel — decoupled de "perfil público ativo"
// (artist_profiles.public_enabled continua exclusivo do artista e
// continua exigindo ativação explícita; ter um slug sozinho não expõe
// nada, a rota /[slug] confere public_enabled=true além do slug, ver
// src/app/[slug]/page.tsx). É a base do fluxo "Adicionar um
// Artista/Booker" por código (representation_requests, sem
// invite/token quando as duas contas já existem — antes só existia
// lookup por contato/e-mail/telefone) e também do roteamento de
// WhatsApp por link individual, que já usava esse mesmo campo.
// Código de erro do Postgres pra "unique_violation" (profiles.slug é
// UNIQUE, migration 0015).
const UNIQUE_VIOLATION = '23505';

// Sufixo em caso de colisão (07/10/2026, achado da fundadora: "muitas
// Eduardas no futuro, o que acontece?") — antes era um número aleatório
// de 4 dígitos (`eduarda-4821`), funcional mas feio. Agora é sequencial
// (`eduarda`, depois `eduarda-2`, `eduarda-3`...), e cada tentativa é o
// próprio UPDATE (não SELECT-depois-UPDATE): se duas pessoas com o
// mesmo nome caem no mesmo candidato ao mesmo tempo, a constraint
// UNIQUE do banco decide quem ganha e a outra tentativa simplesmente
// recebe o erro 23505 e tenta o próximo número — elimina de vez a
// pequena corrida que existia na versão anterior (checar livre e só
// depois gravar, sem nada travando entre os dois passos).
export async function ensurePublicId(
  supabase: AnySupabaseClient,
  userId: string,
  nameHint: string
): Promise<string> {
  let base = slugify(nameHint) || 'doopla';
  if (RESERVED_SLUGS.has(base)) base = `${base}-doopla`;

  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const { error } = await supabase.from('profiles').update({ slug: candidate }).eq('id', userId);
    if (!error) return candidate;
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }

  // Caso patológico (50+ pessoas com o mesmo nome base): sufixo
  // aleatório maior em vez de travar pra sempre.
  const fallback = `${base}-${Math.floor(Math.random() * 100000)}`;
  await supabase.from('profiles').update({ slug: fallback }).eq('id', userId);
  return fallback;
}
