export { buildContextPackage } from './build';
export { renderContextForPrompt, resolveProfessionalDisplayName } from './render';
export type {
  ContextBuildResult,
  ContextFact,
  ContextFactSourceType,
  ContextFactType,
  ContextPackage,
  ContextSection,
  MessageContextItem,
  MessageProvenance,
  MessagesSection,
} from './types';
export {
  CONTEXT_MAX_MESSAGE_TEXT_CHARS,
  CONTEXT_MAX_MESSAGES,
  CONTEXT_MAX_PROFILE_FIELD_CHARS,
  CONTEXT_MESSAGE_WINDOW_DAYS,
} from './budget';
