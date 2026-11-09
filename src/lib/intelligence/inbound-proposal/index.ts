export { INBOUND_PROPOSAL_MODEL, AI_FEATURE_INBOUND_PROPOSAL_DETECTION, INBOUND_PROPOSAL_MAX_RETRIES, INBOUND_PROPOSAL_CLASSIFIER_VERSION, MAX_DETECTED_PROPOSALS } from './config';
export type { DetectedInboundProposal } from './types';
export { resolveSubjectKeyForNewProposal } from './subject-key';
export { detectInboundProposal } from './detector';
export type { InboundProposalModelCall, InboundProposalModelCallResult, InboundProposalModelOutput, DetectInboundProposalResult } from './detector';
export { INBOUND_PROPOSAL_GOLDEN_SUITE_CASES } from './golden-suite';
export type { InboundProposalGoldenSuiteCase } from './golden-suite';
