import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — Bloco 5: tipos centrais do Approval
// Engine. APPROVED aqui nunca significa COMMUNICATED_TO_EXTERNAL nem
// ACCEPTED_BY_EXTERNAL — esse limite pertence a um bloco futuro.

export const OPERATION_TYPES = ['contextual_decision', 'explicit_decision', 'counterproposal', 'revocation', 'professional_initiated'] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

// operation_types que exigem communicated_proposal_message_ids
// não-vazio (CHECK simétrico espelhado na migration 0045 via
// cardinality()) — nunca array_length(), que retorna NULL pra vazio.
export const OPERATION_TYPES_REQUIRING_PROVENANCE: readonly OperationType[] = ['contextual_decision', 'explicit_decision', 'counterproposal'];

export const INCONCLUSIVE_REASONS = ['model_ambiguous', 'context_budget_exceeded', 'chain_candidate_overflow'] as const;
export type InconclusiveReason = (typeof INCONCLUSIVE_REASONS)[number];

export const COMMUNICATED_PROPOSAL_CLASSIFICATION_OUTCOMES = ['not_a_proposal', 'created_candidate', 'reaffirmed_candidate', 'superseded_candidate'] as const;
export type CommunicatedProposalClassificationOutcome = (typeof COMMUNICATED_PROPOSAL_CLASSIFICATION_OUTCOMES)[number];

export const CANDIDATE_STATUSES = ['open', 'possibly_superseded', 'structurally_closed'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

// Uma decisão pronta pra commit_approval_resolution — corresponde 1:1
// ao shape jsonb esperado por p_decisions na migration 0045.
export type PendingDecision = {
  commercialRootId: string;
  decisionCategory: ProfessionalDecisionCategory;
  subjectKey: string;
  operationType: OperationType;
  approvedValue: Record<string, unknown> | null; // null só quando operationType='revocation'
  communicatedProposalMessageIds: string[]; // vazio só quando revocation/professional_initiated
  referredValue: Record<string, unknown> | null;
};

// Saída fechada do Approval Resolver — o model nunca inventa
// referência: só seleciona entre candidatos já enumerados pelo código
// (closed-candidate-selection principle, V2) ou declara no_match/
// ambiguous/not_a_decision.
export type ApprovalResolverOutput =
  | { outcome: 'resolved'; decisions: PendingDecision[] }
  | { outcome: 'inconclusive'; reason: Exclude<InconclusiveReason, 'context_budget_exceeded' | 'chain_candidate_overflow'> };

export type AcquireClaimResult = {
  granted: boolean;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  denyReason: 'already_resolved' | 'already_pinned_for_context' | 'backoff' | 'claim_held_by_another_worker' | null;
};

export type ReserveDispatchTokenResult = {
  reserved: boolean;
  denyReason: 'lease_invalid_or_expired' | 'rate_limited' | null;
};

export type CommitResolutionResult = {
  committed: boolean;
  discardReason: 'lease_invalid_or_expired' | 'already_resolved' | 'stale_context_discarded' | null;
  approvalResolutionId: string | null;
  approvalRecordIds: string[];
};
