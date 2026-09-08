import { apiBaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// Update direto sob RLS própria (profiles/artist_profiles: update own,
// migration 0001/0019) — sem regra de negócio escondida em Server
// Action pra esses campos (diferente de bookings), mesma classe seguro
// já usada em agenda_entries/payment_details.
export async function updateProfileFields(profileId: string, fields: { city?: string | null; state?: string | null }): Promise<void> {
  const { error } = await supabase.from('profiles').update(fields).eq('id', profileId);
  if (error) throw error;
}

export async function updateArtistProfileFields(
  profileId: string,
  fields: { stage_name?: string | null; bio?: string | null; instagram_url?: string | null; portfolio_url?: string | null; public_enabled?: boolean }
): Promise<void> {
  const { error } = await supabase.from('artist_profiles').update(fields).eq('profile_id', profileId);
  if (error) throw error;
}

export type CloseAccountResult = { ok: true } | { ok: false; error: string };

// Account closure flow (Settings V2, 08/09/2026) — espelha
// requestAccountClosureAction do painel web, mas via rota de API
// (src/app/api/mobile/account/close/route.ts): banir a conta e trocar
// o e-mail exigem a Admin API (service_role), segredo de servidor que
// nunca chega ao app — mesmo racional de requestWhatsappVerification
// em data/whatsapp-identity.ts. A RPC close_own_account roda dentro
// dessa rota, nunca chamada direto daqui.
export async function closeAccount(password: string, accessToken: string): Promise<CloseAccountResult> {
  const response = await fetch(`${apiBaseUrl()}/api/mobile/account/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error === 'wrong_password' ? 'Senha incorreta.' : 'Não foi possível excluir sua conta agora.' };
  }
  return { ok: true };
}
