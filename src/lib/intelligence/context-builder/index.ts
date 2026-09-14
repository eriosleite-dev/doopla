export { buildContextPackage } from './build';
export { renderContextForPrompt, resolveProfessionalDisplayName } from './render';
export type {
  CommercialHistoryRetrievalStrategy,
  CommercialHistorySection,
  ContextBuildResult,
  ContextFact,
  ContextFactSourceType,
  ContextFactType,
  ContextPackage,
  ContextPackageSectionName,
  ContextSection,
  MessageContextItem,
  MessageProvenance,
  MessagesSection,
  UnavailableSource,
} from './types';
export {
  CONTEXT_MAX_BUSINESS_CONTEXT_FIELD_CHARS,
  CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS,
  CONTEXT_MAX_MESSAGE_TEXT_CHARS,
  CONTEXT_MAX_MESSAGES,
  CONTEXT_MAX_PROFILE_FIELD_CHARS,
  CONTEXT_MESSAGE_WINDOW_DAYS,
} from './budget';
