// Doopla Intelligence Core v1 — Bloco 4: configuração do Response
// Planner, isolada da config do Intent Classifier — o modelo de
// planejamento pode divergir do de classificação no futuro, nunca a
// mesma constante por acidente (mesmo raciocínio de
// classification/config.ts).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção.
export const PLANNER_MODEL = 'gpt-5-mini';

export const AI_FEATURE_RESPONSE_PLANNING = 'response_planning';

// Mesma política de retry do Classifier — uma tentativa extra além da
// original.
export const PLANNER_MAX_RETRIES = 1;
