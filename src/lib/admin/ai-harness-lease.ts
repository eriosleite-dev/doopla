import type { SupabaseClient } from '@supabase/supabase-js';

// AI Evaluation Harness — wrapper das RPCs claim/release_ai_harness_run_lease
// (migration 0118). Mesmo padrão já estabelecido no projeto pra RPCs
// novas ainda não presentes em src/lib/supabase/types.ts (gerado da
// última sincronização com o schema real do banco, não regenerado
// nesta sessão) — ver src/lib/runtime/whatsapp-outreach-authorization.ts,
// mesma técnica (client com tipo solto só neste ponto de borda, nunca
// propagado pro resto do arquivo que chama este wrapper).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type AiHarnessLeaseClaim = { granted: boolean; leaseToken: string | null };

// Lock singleton real (claim + release), NUNCA um cooldown por
// timestamp — achado da revisão da fundadora (16/10/2026): um
// cooldown fixo desbloquearia uma segunda execução antes da primeira
// de fato terminar, sempre que ela demorasse mais que o cooldown.
// Comportamento comprovado contra Postgres real nesta sessão (ver
// comentário completo na migration 0118).
export async function claimAiHarnessRunLease(supabase: AnySupabaseClient, leaseSeconds: number): Promise<AiHarnessLeaseClaim> {
  const { data, error } = await supabase.rpc('claim_ai_harness_run_lease', { p_lease_seconds: leaseSeconds }).maybeSingle();
  if (error) throw new Error(`claim_ai_harness_run_lease falhou: ${error.message}`);
  const row = data as { granted: boolean; lease_token: string | null } | null;
  return { granted: Boolean(row?.granted), leaseToken: row?.lease_token ?? null };
}

// Sempre chamado em try/finally pela Server Action, sucesso ou erro —
// libera o lock na hora, sem esperar o prazo de segurança todo (que
// só existe pra cobrir crash do processo, nunca o caminho normal).
export async function releaseAiHarnessRunLease(supabase: AnySupabaseClient, leaseToken: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_ai_harness_run_lease', { p_lease_token: leaseToken });
  if (error) throw new Error(`release_ai_harness_run_lease falhou: ${error.message}`);
  return Boolean(data);
}
