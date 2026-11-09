import type { SupabaseClient } from '@supabase/supabase-js';

import { valuesStructurallyEqual } from '../intelligence/policy-gate-post';
import { INBOUND_PROPOSAL_CLASSIFIER_VERSION, type DetectedInboundProposal } from '../intelligence/inbound-proposal';

// Doopla Intelligence Core v1 — Runtime: wrapper sobre
// try_classify_communicated_proposal (Bloco 5, migration 0045/0047,
// estendida nesta rodada com is_system_caller() — migration 0053).
//
// Achado desta rodada: esta RPC nunca teve chamador real — o outcome
// (created/reaffirmed/superseded_candidate) é decidido pelo CHAMADOR,
// nunca por ela mesma. Aqui reaproveita-se o MESMO mecanismo de chain
// já usado por resolution-context.ts (get_communicated_proposal_candidates)
// e pelo matcher do Bloco 6 (valuesStructurallyEqual) — nunca uma
// segunda política: a única novidade é que agora existe um chamador
// (o extrator de proposta inbound), a lógica de chain é a mesma que
// o Bloco 5 já usa pra montar ResolutionContext.

export type ProposedBy = 'external_participant' | 'professional';

type CandidateChainRow = {
  id: string;
  status: string;
  decision_category: string;
  subject_key: string;
  proposed_value: Record<string, unknown> | null;
};

export async function registerInboundProposal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    messageId: string;
    professionalId: string;
    bookingId: string | null;
    opportunityId: string | null;
    commercialRootId: string;
    proposedBy: ProposedBy;
    proposal: DetectedInboundProposal;
  }
): Promise<{ alreadyClassified: boolean; resultingCandidateId: string | null; limitExceeded: boolean }> {
  const { data: candidatesRaw, error: candError } = await supabase.rpc('get_communicated_proposal_candidates', {
    p_professional_id: params.professionalId,
    p_booking_id: params.bookingId,
    p_opportunity_id: params.opportunityId,
  });
  if (candError) throw new Error(`get_communicated_proposal_candidates falhou: ${candError.message}`);

  const chain = ((candidatesRaw ?? []) as CandidateChainRow[]).filter(
    (c) => c.decision_category === params.proposal.decisionCategory && c.subject_key === params.proposal.rawSubjectKey
  );
  // supersede só pode alvejar uma linha 'open' (CHECK físico da RPC) —
  // 'possibly_superseded' já foi rebaixada por uma classificação
  // anterior, nunca alvo de novo.
  const openRow = chain.find((c) => c.status === 'open') ?? null;

  let outcome: 'created_candidate' | 'reaffirmed_candidate' | 'superseded_candidate';
  let supersedesCandidateId: string | null = null;
  if (!openRow) {
    outcome = 'created_candidate';
  } else if (valuesStructurallyEqual(openRow.proposed_value, params.proposal.rawValue)) {
    outcome = 'reaffirmed_candidate';
  } else {
    outcome = 'superseded_candidate';
    supersedesCandidateId = openRow.id;
  }

  const { data, error } = await supabase
    .rpc('try_classify_communicated_proposal', {
      p_message_id: params.messageId,
      p_classifier_version: INBOUND_PROPOSAL_CLASSIFIER_VERSION,
      p_commercial_root_id: params.commercialRootId,
      p_outcome: outcome,
      p_decision_category: params.proposal.decisionCategory,
      p_subject_key: params.proposal.rawSubjectKey,
      p_proposed_by: params.proposedBy,
      p_proposed_value: params.proposal.rawValue,
      p_supersedes_candidate_id: supersedesCandidateId,
    })
    .single();
  if (error || !data) throw new Error(`try_classify_communicated_proposal falhou: ${error?.message ?? 'sem dado'}`);
  const row = data as { already_classified: boolean; resulting_candidate_id: string | null; limit_exceeded: boolean };
  return { alreadyClassified: row.already_classified, resultingCandidateId: row.resulting_candidate_id, limitExceeded: row.limit_exceeded };
}
