// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
// configuração isolada, mesmo raciocínio de todos os outros
// reconhecedores do projeto (nunca a mesma constante por acidente,
// nunca o mesmo model call reaproveitado entre módulos com contratos
// diferentes).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva dos outros blocos).
export const PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL = 'gpt-5-mini';
export const AI_FEATURE_PROFESSIONAL_SELF_PAUSE_RECOGNITION = 'professional_self_pause_recognition';
export const PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MAX_RETRIES = 1;
