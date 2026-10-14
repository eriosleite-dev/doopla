// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// barrel, mesmo padrão dos outros módulos de intelligence/.
export { recognizeDelegatedContactRequest, type DelegatedContactRecognizerModelCall, type RecognizeDelegatedContactRequestResult } from './recognizer';
export { checkRecipientConsent, type RecipientConsentCheckModelCall, type RecipientConsentCheckResult } from './recipient-consent-check';
export {
  DELEGATED_CONTACT_SIGNALS,
  RECIPIENT_CONSENT_OUTCOMES,
  type ActiveDelegatedContactSummary,
  type DelegatedContactSignal,
  type RecipientConsentOutcome,
} from './types';
export {
  AI_FEATURE_DELEGATED_CONTACT_RECOGNITION,
  AI_FEATURE_RECIPIENT_CONSENT_CHECK,
  DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS,
} from './config';
