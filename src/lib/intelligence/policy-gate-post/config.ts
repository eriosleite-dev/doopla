// Doopla Intelligence Core v1 — Post-model Policy Gate: configuração,
// isolada da config de Planner/Classifier/Approval Engine (mesmo
// raciocínio dos blocos anteriores — nunca a mesma constante por
// acidente).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva dos outros blocos).
export const POLICY_GATE_EXTRACTOR_MODEL = 'gpt-5-mini';
export const AI_FEATURE_POLICY_GATE_EXTRACTION = 'policy_gate_extraction';
export const POLICY_GATE_EXTRACTOR_MAX_RETRIES = 1;

// Versão da política — gravada em toda policy_gate_decisions.policy_version
// (migration 0049). Mudar uma regra de matching/extração no futuro
// sempre incrementa isto, nunca reinterpreta retroativamente decisões
// já gravadas.
export const POLICY_GATE_VERSION = 'v1';

// Limite defensivo contra um extrator hostil/quebrado devolvendo um
// array sem fim — mesma higiene estrutural de MAX_EVIDENCE_USED
// (planner/invariants.ts).
export const MAX_EXTRACTED_COMMITMENTS = 20;
