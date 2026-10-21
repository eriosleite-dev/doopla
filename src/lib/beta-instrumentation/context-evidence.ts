import type { SupabaseClient } from '@supabase/supabase-js';

import { isCommitmentAuthorizingSourceType } from '../intelligence/planner';
import type { EvidenceUsed } from '../intelligence/planner';

// Doopla Intelligence Core v1 — Beta Instrumentation: persistência
// detalhada da camada A de evidência (EvidenceUsed[] completo — ver
// planner/invariants.ts). Nunca lançável (mesmo idioma de
// observability.ts): falha aqui é telemetria, nunca derruba o ciclo
// principal do Runtime.

export type RecordContextEvidenceParams = {
  runId: string;
  professionalId: string;
  evidence: readonly EvidenceUsed[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordOrchestratorRunContextEvidence(supabase: SupabaseClient<any>, params: RecordContextEvidenceParams): Promise<void> {
  if (params.evidence.length === 0) return;

  const payload = params.evidence.map((e) => ({
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    // conversation_message não tem field — nunca inventa um valor.
    field: 'field' in e ? e.field : null,
    isCommitmentAuthorizing: isCommitmentAuthorizingSourceType(e.sourceType),
  }));

  const { error } = await supabase.rpc('record_orchestrator_run_context_evidence', {
    p_run_id: params.runId,
    p_professional_id: params.professionalId,
    p_evidence: payload,
  });

  if (error) {
    console.error(`record_orchestrator_run_context_evidence falhou (telemetria — ciclo principal não é afetado): ${error.message}`);
  }
}
