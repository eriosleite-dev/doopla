// Doopla Intelligence Core v1 — Orchestrator/Runtime Integration Layer.
// Ponto de entrada único: processInboundEvent(). Nenhum adaptador de
// canal real (WhatsApp/Meta/Resend) nesta rodada — quem chama este
// módulo já resolveu channel/professionalId/conversationId; ver
// comentário em types.ts sobre essa fronteira.

export { processInboundEvent } from './pipeline';
export type { InboundEvent, RuntimeCycleOutcome } from './types';

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
  cancelOutboundIntent,
} from './outbound';

export { resolveSystemActorContext } from './system-actor';
export { buildStructuralFacts } from './structural-facts';
