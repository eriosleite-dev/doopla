// Doopla Intelligence Core v1 — Orchestrator/Runtime Integration Layer.
// Ponto de entrada único: processInboundEvent(). Nenhum adaptador de
// canal real (WhatsApp/Meta/Resend) nesta rodada — quem chama este
// módulo já resolveu channel/professionalId/conversationId; ver
// comentário em types.ts sobre essa fronteira.

export { processInboundEvent } from './pipeline';
export type { InboundEvent, RuntimeCycleOutcome, RuntimeDisposition } from './types';

export { resolveRuntimeDisposition } from './disposition';
export { persistAiMessage } from './professional-message';
export { resolveRecipientType, resolveOutboundAction, shouldRunApprovalEngine } from './recipient';
export type { OutboundAction } from './recipient';
export { resolveEffectiveCommercialRoot } from './commercial-root';

export { claimInboundEvent, finishInboundEvent } from './inbound-events';
export type { ClaimInboundEventResult } from './inbound-events';

export { acquireConversationLease, releaseConversationLease } from './conversation-lease';
export type { AcquireLeaseResult } from './conversation-lease';

export { resolveOrCreateExternalParticipant, persistInboundMessage } from './intake';

export { ensureOpportunityForConversation } from './commercial-root';

export {
  createOutboundIntent,
  claimOutboundIntentForSend,
  markOutboundIntentSentConfirmed,
  markOutboundIntentSendUnknown,
  markOutboundIntentFailed,
  markOutboundIntentDelivered,
  markOutboundIntentRead,
  listClaimableOutboundIntents,
  cancelOutboundIntent,
} from './outbound';
export type { OutboundIntentRow } from './outbound';

export { resolveSystemActorContext } from './system-actor';
export { buildStructuralFacts } from './structural-facts';

export {
  createRuntimePendingReply,
  listPendingRuntimeReplies,
  resolveRuntimePendingReplyAllowed,
  resolveRuntimePendingReplyStillBlocked,
  supersedeRuntimePendingRepliesForTerminalRoot,
  fetchPolicyGateDecisionChecks,
  beginRuntimePendingReplyAttempt,
  recordRuntimePendingReplyBusy,
  listDueRuntimePendingReplies,
} from './pending-replies';
export type { RuntimePendingReply, GateCheckSnapshot } from './pending-replies';

export { computeRuntimeRetryBackoffSeconds, RUNTIME_PENDING_REPLY_MAX_ATTEMPTS, RUNTIME_PENDING_REPLY_SAFETY_NET_SECONDS } from './retry-backoff';

export {
  shouldCreatePendingReply,
  isEligibleForAutoMatch,
  blockedIdentities,
  shouldSupersedeOnCreation,
  shouldAttemptResume,
  freshChecksAddressPendingIdentities,
} from './pending-replies-matching';
export type { BlockedIdentity } from './pending-replies-matching';

export { registerInboundProposal } from './proposal-classification';
export type { ProposedBy } from './proposal-classification';

export { resolveCommercialRootForResumption } from './commercial-root';

export { attemptResumptionsAfterApproval, resumeOnePendingReply, reconcileDueRuntimePendingReplies } from './resumption';
export type { ResumptionOutcome, ResumptionModelCalls } from './resumption';
