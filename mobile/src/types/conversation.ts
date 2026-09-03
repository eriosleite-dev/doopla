// Espelha src/lib/conversations/data.ts (painel web) — cópia
// deliberada, nunca import cruzando pra dentro de src/ do Next.js
// (mesma decisão de booking.ts). Se o schema mudar, os dois lugares
// precisam ser atualizados manualmente.

export type ConversationStatus = 'open' | 'closed' | 'archived';
export type ConversationType = 'external_inquiry' | 'professional_self';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageAuthorType = 'external_participant' | 'professional' | 'ai' | 'system';
export type PreparedResponseOutcome = 'sent' | 'edited';

// Espelha src/lib/conversations/state.ts — ver esse arquivo pro
// racional completo de cada estado/prioridade.
export type ConversationState = 'needs_you' | 'waiting_client' | 'in_progress' | 'closed';

export type ConversationOperationalFacts = {
  conversationId: string;
  conversationType: ConversationType;
  status: ConversationStatus;
  mandate: string;
  lastActivityAt: string;
  relatedBookingId: string | null;
  relatedOpportunityId: string | null;
  externalParticipantId: string | null;
  lastMessageId: string | null;
  lastMessageAuthorType: string | null;
  lastMessageDirection: MessageDirection | null;
  lastMessageCreatedAt: string | null;
  hasPendingRuntimeReply: boolean;
  pendingRuntimeReplySince: string | null;
  lastOutboundIntentDeliveryState: string | null;
  lastOutboundIntentUpdatedAt: string | null;
  state: ConversationState;
};

export type ConversationMessage = {
  id: string;
  direction: MessageDirection;
  authorType: MessageAuthorType;
  authorProfileId: string | null;
  authorExternalParticipantId: string | null;
  channel: string;
  contentType: 'text' | 'audio' | 'attachment';
  body: string | null;
  audioUrl: string | null;
  transcript: string | null;
  attachmentUrl: string | null;
  generatedBy: 'human' | 'ai';
  createdAt: string;
  repliedToOutboundIntentId: string | null;
  preparedResponseOutcome: PreparedResponseOutcome | null;
};

export type PendingDraft = {
  id: string;
  content: string;
  deliveryState: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalParticipant = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};
