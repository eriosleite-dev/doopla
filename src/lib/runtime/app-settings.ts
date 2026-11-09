import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla — wrapper fino sobre app_settings (migration 0099,
// billing_kill_switch). Fonte de verdade no banco, nunca só uma env
// var do Next — reativar uma proteção nunca exige nova migration, só
// um UPDATE nesta tabela (mesmo princípio já estabelecido pro billing
// kill switch). Sem RLS policy pra anon/authenticated — só client
// service_role (que bypassa RLS) consegue ler.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export async function readAppSettingFlag(supabase: AnySupabaseClient, key: string): Promise<boolean> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data as { value: string } | null)?.value === 'true';
}
