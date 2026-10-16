import type { SupabaseClient } from '@supabase/supabase-js';

// AI Evaluation Harness — wrapper da RPC claim_ai_harness_run_lease
// (migration 0118). Mesmo padrão já estabelecido no projeto pra RPCs
// novas ainda não presentes em src/lib/supabase/types.ts (gerado da
// última sincronização com o schema real do banco, não regenerado
// nesta sessão) — ver src/lib/runtime/whatsapp-outreach-authorization.ts,
// mesma técnica (client com tipo solto só neste ponto de borda, nunca
// propagado pro resto do arquivo que chama este wrapper).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Devolve true só pra quem de fato "ganhou" a janela de cooldown —
// nunca uma função booleana qualquer, é o resultado direto do UPDATE
// atômico no banco (nenhuma corrida possível entre duas chamadas
// concorrentes, ver comentário completo na migration).
export async function claimAiHarnessRunLease(supabase: AnySupabaseClient, cooldownSeconds: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_ai_harness_run_lease', { p_cooldown_seconds: cooldownSeconds });
  if (error) throw new Error(`claim_ai_harness_run_lease falhou: ${error.message}`);
  return Boolean(data);
}
