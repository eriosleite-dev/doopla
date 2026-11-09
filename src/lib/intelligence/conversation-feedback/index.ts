// ADR 0011 (20/10/2026) — Fase A: barrel, mesmo padrão dos outros
// módulos de intelligence/.
export { recognizeConversationFeedback, type ConversationFeedbackRecognizerModelCall, type RecognizeConversationFeedbackResult } from './recognizer';
export { CONVERSATION_FEEDBACK_SIGNALS, type ConversationFeedbackSignal } from './types';
export {
  AI_FEATURE_CONVERSATION_FEEDBACK_RECOGNITION,
  CONVERSATION_FEEDBACK_RECOGNIZER_MAX_RETRIES,
  CONVERSATION_FEEDBACK_RECOGNIZER_MODEL,
} from './config';
