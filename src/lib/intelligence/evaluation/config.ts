// ADR 0011 — laboratório de avaliação (juiz isolado). Mesmo padrão de
// todo recognizer do projeto: config isolada, nunca reaproveita
// constante de outro módulo por acidente.
export const EVALUATION_JUDGE_MODEL = 'gpt-5-mini';
export const AI_FEATURE_CONVERSATION_EVALUATION = 'conversation_outcome_evaluation';
export const EVALUATION_JUDGE_MAX_RETRIES = 1;
