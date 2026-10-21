// ADR 0011 (20/10/2026) — Fase A do sistema de evolução contínua:
// tipos do reconhecedor de feedback semântico em professional_self.
export const CONVERSATION_FEEDBACK_SIGNALS = ['negative', 'positive', 'no_signal'] as const;
export type ConversationFeedbackSignal = (typeof CONVERSATION_FEEDBACK_SIGNALS)[number];
