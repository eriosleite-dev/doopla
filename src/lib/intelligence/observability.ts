import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, OrchestratorRun } from '@/lib/supabase/types';
import type { OrchestratorRunFinish, OrchestratorRunStart } from './types';

// Doopla Intelligence Core v1 — observabilidade mínima. Fina camada
// sobre start_orchestrator_run/finish_orchestrator_run (migration
// 0042) — nunca grava chain of thought nem duplica conteúdo de
// conversation_messages; só metadados de execução (ver comentários da
// tabela orchestrator_runs).

export async function startOrchestratorRun(
  supabase: SupabaseClient<Database>,
  params: OrchestratorRunStart
): Promise<OrchestratorRun | null> {
  const { data, error } = await supabase.rpc('start_orchestrator_run', {
    p_conversation_id: params.conversationId,
    p_represented_professional_id: params.representedProfessionalId,
    p_actor_type: params.actorType,
    p_actor_profile_id: params.actorProfileId,
    p_external_participant_id: params.externalParticipantId,
    p_trigger_source: params.triggerSource,
    p_eligible_tools: params.eligibleTools,
  });

  if (error || !data) return null;
  return data as OrchestratorRun;
}

export async function finishOrchestratorRun(
  supabase: SupabaseClient<Database>,
  params: OrchestratorRunFinish
): Promise<OrchestratorRun | null> {
  const { data, error } = await supabase.rpc('finish_orchestrator_run', {
    p_run_id: params.runId,
    p_status: params.status,
    p_called_tools: params.calledTools,
    p_error: params.error,
    p_fallback_used: params.fallbackUsed,
  });

  if (error || !data) return null;
  return data as OrchestratorRun;
}
