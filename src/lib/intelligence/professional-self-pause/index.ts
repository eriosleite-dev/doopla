// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
// barrel, mesmo padrão dos outros módulos de intelligence/.
export { recognizeProfessionalSelfPauseRequest, type ProfessionalSelfPauseRecognizerModelCall, type RecognizePauseRequestResult } from './recognizer';
export { PROFESSIONAL_SELF_PAUSE_SIGNALS, type ProfessionalSelfPauseSignal } from './types';
export {
  AI_FEATURE_PROFESSIONAL_SELF_PAUSE_RECOGNITION,
  PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MAX_RETRIES,
  PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL,
} from './config';
