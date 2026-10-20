// Doopla Intelligence Core v1 — Memória de preferências profissionais
// (ADR 0004, Rodadas 4/5): configuração isolada, mesmo raciocínio dos
// demais blocos (delegated-contact/config.ts, approval/config.ts
// etc.) — nunca a mesma constante por acidente, nunca o mesmo model
// call reaproveitado entre módulos com contratos diferentes.
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva dos outros blocos).
export const PREFERENCE_RECOGNIZER_MODEL = 'gpt-5-mini';
export const AI_FEATURE_PREFERENCE_RECOGNITION = 'professional_preference_recognition';
export const PREFERENCE_RECOGNIZER_MAX_RETRIES = 1;
