import { supabase } from '@/lib/supabase';

// Espelha src/app/dashboard/data.ts (getArtistLinkRouting/getArtistBookers)
// e src/app/dashboard/actions.ts (updateLinkRoutingAction) — mesma
// tabela (artist_link_routing, migration 0023), mesma regra de negócio,
// nenhum sistema paralelo. Gap bloqueante do beta (14/09/2026): o link
// individual de booking/orçamento é o canal de entrada de cliente que a
// fundadora decidiu preservar como produto atual, mas o App não tinha
// nenhuma tela pra ver/copiar o link nem configurar quem recebe os
// pedidos.

export type LinkRoutingMode = 'eu' | 'meu_booker' | 'eu_e_meu_booker';

export type ArtistLinkRouting = { mode: LinkRoutingMode; bookerId: string | null };

export type BookerOption = { profileId: string; fullName: string };

export async function fetchArtistLinkRouting(artistId: string): Promise<ArtistLinkRouting | null> {
  const { data, error } = await supabase
    .from('artist_link_routing')
    .select('mode, booker_id')
    .eq('artist_id', artistId)
    .maybeSingle<{ mode: LinkRoutingMode; booker_id: string | null }>();
  if (error) throw error;
  if (!data) return null;
  return { mode: data.mode, bookerId: data.booker_id };
}

// Só bookers que já representam este artista (join via `representations`)
// — nunca todo booker do sistema, mesmo filtro do Web.
export async function fetchArtistBookers(artistId: string): Promise<BookerOption[]> {
  const { data: reps, error: repsError } = await supabase
    .from('representations')
    .select('booker_profile_id')
    .eq('artist_profile_id', artistId);
  if (repsError) throw repsError;

  const bookerIds = (reps ?? []).map((r) => r.booker_profile_id as string);
  if (bookerIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', bookerIds)
    .returns<{ id: string; full_name: string }[]>();
  if (profilesError) throw profilesError;

  return (profiles ?? []).map((p) => ({ profileId: p.id, fullName: p.full_name }));
}

export type UpdateLinkRoutingResult = { ok: true } | { ok: false; error: string };

// Mesma validação de negócio do Web antes do upsert (evita um erro cru
// de RLS pro usuário) — a policy "artist_link_routing: update own"
// (migration 0023) já reforça a mesma regra no banco, então isto é
// mensagem melhor, não a única linha de defesa.
export async function updateArtistLinkRouting(
  artistId: string,
  mode: LinkRoutingMode,
  bookerId: string | null
): Promise<UpdateLinkRoutingResult> {
  if (mode !== 'eu') {
    if (!bookerId) return { ok: false, error: 'Escolha um booker da sua rede.' };
    const { data: rep, error: repError } = await supabase
      .from('representations')
      .select('id')
      .eq('artist_profile_id', artistId)
      .eq('booker_profile_id', bookerId)
      .maybeSingle();
    if (repError) throw repError;
    if (!rep) return { ok: false, error: 'Você só pode escolher um booker que já representa você.' };
  }

  const { error } = await supabase.from('artist_link_routing').upsert(
    { artist_id: artistId, mode, booker_id: mode === 'eu' ? null : bookerId },
    { onConflict: 'artist_id' }
  );
  if (error) return { ok: false, error: 'Não foi possível salvar o roteamento.' };
  return { ok: true };
}
