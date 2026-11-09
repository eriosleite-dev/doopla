import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime, passo 6A+6B Fase 2: precedência
// JÁ CONVENCIONADA de como a Doopla se refere à profissional
// (stage_name ?? full_name), a mesma usada por
// intelligence/tools/get-professional-profile.ts (a única tool que já
// resolvia isso pro model). Fatorado aqui porque a Fase 2 precisa da
// MESMA regra em 2 lugares novos (pipeline.ts, na criação do template
// determinístico; send-outbound-intents/route.ts, na revalidação/envio
// real) — nunca uma segunda implementação divergente da mesma decisão
// de produto.

export async function resolveProfessionalDisplayName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  professionalId: string
): Promise<string | null> {
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', professionalId).maybeSingle();
  const fullName = (profile as { full_name: string } | null)?.full_name ?? null;
  if (!fullName) return null;

  const { data: artistProfile } = await supabase.from('artist_profiles').select('stage_name').eq('profile_id', professionalId).maybeSingle();
  const stageName = (artistProfile as { stage_name: string | null } | null)?.stage_name ?? null;

  return stageName ?? fullName;
}
