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
export async function ensurePublicId(
  supabase: AnySupabaseClient,
  userId: string,
  nameHint: string
): Promise<string> {
  let base = slugify(nameHint) || 'doopla';
  if (RESERVED_SLUGS.has(base)) base = `${base}-doopla`;
  let slug = base;
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('slug', slug)
      .maybeSingle<{ id: string }>();
    if (!existing && !RESERVED_SLUGS.has(slug)) break;
    slug = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  await supabase.from('profiles').update({ slug }).eq('id', userId);
  return slug;
}
