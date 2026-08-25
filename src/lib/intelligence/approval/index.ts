// Doopla Intelligence Core v1 — Bloco 5: Approval Engine.
// Boundary explícito: KNOW ≠ COMMUNICATED ≠ APPROVED ≠ COMMITTED.
// Este módulo representa só APPROVED — nunca envia, nunca executa
// tool de escrita, nunca decide sozinho que algo foi comunicado ou
// aceito pela contraparte externa.
export {
  canonicalizeV1,
  computeContextIdentity,
  computeMessageContentDigest,
  computeUsableText,
  CanonicalizationError,
} from './canonicalize';
export type { ResolutionContextV1, MessageWindowEntry, ActiveApprovalCandidate, CommunicatedProposalCandidateEntry, JsonValue, ContextSchemaVersion } from './canonicalize';

export {
  OPERATION_TYPES,
  OPERATION_TYPES_REQUIRING_PROVENANCE,
  INCONCLUSIVE_REASONS,
  COMMUNICATED_PROPOSAL_CLASSIFICATION_OUTCOMES,
  CANDIDATE_STATUSES,
} from './types';
export type {
  OperationType,
  InconclusiveReason,
  CommunicatedProposalClassificationOutcome,
  CandidateStatus,
  PendingDecision,
  ApprovalResolverOutput,
  AcquireClaimResult,
  ReserveDispatchTokenResult,
  CommitResolutionResult,
} from './types';

export {
  APPROVED_VALUE_SCHEMAS,
  SUBJECT_KEY_TAXONOMY,
  SINGULAR_SUBJECT_KEY,
  isMultiInstanceCategory,
  validateApprovedValue,
} from './value-schemas';
export type { ApprovedValueFor } from './value-schemas';

export {
  APPROVAL_RESOLVER_MODEL,
  AI_FEATURE_APPROVAL_RESOLUTION,
  APPROVAL_RESOLVER_MAX_RETRIES,
  CLAIM_LEASE_SECONDS,
  BACKOFF_BASE_SECONDS,
  BACKOFF_MAX_SECONDS,
  RATE_LIMITER_CAPACITY,
  RATE_LIMITER_REFILL_PERIOD_SECONDS,
  MAX_MESSAGE_WINDOW,
  MAX_ACTIVE_CANDIDATES,
  MAX_CANDIDATES_PER_CHAIN,
  RECENT_MESSAGE_WINDOW_SIZE,
  CLASSIFIER_VERSION,
  CONTEXT_SCHEMA_VERSION,
} from './config';

export {
  refillTokenBucket,
  tryConsumeToken,
  maxConsumptionsInWindow,
  maxWaitForNextTokenSeconds,
  computeNextEligibleDelaySeconds,
} from './rate-limiter';
export type { TokenBucketState } from './rate-limiter';

export { buildResolutionContext } from './resolution-context';
export type { BuildResolutionContextResult } from './resolution-context';

export { resolveApproval } from './resolver';
export type { ApprovalResolverModelCall, ApprovalResolverModelCallResult } from './resolver';

export { runApprovalEngine } from './orchestrator';
export type { RunApprovalEngineResult } from './orchestrator';

export { APPROVAL_GOLDEN_SUITE_CASES } from './golden-suite';
export type { ApprovalGoldenSuiteCase } from './golden-suite';
