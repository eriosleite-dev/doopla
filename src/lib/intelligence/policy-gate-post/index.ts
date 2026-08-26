// Doopla Intelligence Core v1 — Post-model Policy Gate.
// Roda DEPOIS do Response Planner (Bloco 4), ANTES de qualquer envio
// real. Nunca substitui o Approval Resolver (Bloco 5) — só LÊ
// approval_records via get_active_approvals. KNOW ≠ APPROVE.
export {
  POLICY_GATE_EXTRACTOR_MODEL,
  AI_FEATURE_POLICY_GATE_EXTRACTION,
  POLICY_GATE_EXTRACTOR_MAX_RETRIES,
  POLICY_GATE_VERSION,
  MAX_EXTRACTED_COMMITMENTS,
} from './config';

export { POLICY_GATE_OUTCOMES, POLICY_GATE_BLOCK_REASONS } from './types';
export type {
  PolicyGateOutcome,
  PolicyGateBlockReason,
  ExtractedCommitment,
  CommitmentCheck,
  PostModelGateResult,
  ActiveApprovalForMatch,
} from './types';

export { valuesStructurallyEqual } from './value-equality';

export { extractCommitments, policyGateExtractorModelOutputSchema } from './extractor';
export type { PolicyGateExtractorModelCall, PolicyGateExtractorModelCallResult, PolicyGateExtractorModelOutput, ExtractCommitmentsResult } from './extractor';

export { resolveSubjectKey, matchCommitment, evaluateCommitments } from './matcher';

export { evaluatePostModelGate } from './gate';
export type { PostModelGateInput } from './gate';

export { evaluateToolCallGate } from './tool-gate';
export type { ToolCallGateInput } from './tool-gate';

export { applyGateOutcome } from './apply-outcome';

export { logPolicyGateDecision } from './log';
export type { LogPolicyGateDecisionParams } from './log';

export { POLICY_GATE_GOLDEN_SUITE_CASES } from './golden-suite';
export type { PolicyGateGoldenSuiteCase } from './golden-suite';
