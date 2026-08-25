// Doopla Intelligence Core v1 — Bloco 5: configuração do Approval
// Engine, isolada da config de Planner/Classifier (mesmo raciocínio
// dos blocos anteriores — nunca a mesma constante por acidente).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva de planner/config.ts).
export const APPROVAL_RESOLVER_MODEL = 'gpt-5-mini';
export const AI_FEATURE_APPROVAL_RESOLUTION = 'approval_resolution';
export const APPROVAL_RESOLVER_MAX_RETRIES = 1;

// Espelham os defaults das functions SQL (migration 0045) — mantidos
// em código só pra quem monta a chamada (TS) saber o que está sendo
// usado sem precisar inspecionar a migration; a fonte de verdade
// física continua sendo os parâmetros default das próprias functions.
export const CLAIM_LEASE_SECONDS = 120;
export const BACKOFF_BASE_SECONDS = 60.0;
export const BACKOFF_MAX_SECONDS = 3600.0;
export const RATE_LIMITER_CAPACITY = 5.0;
export const RATE_LIMITER_REFILL_PERIOD_SECONDS = 300.0;

// Budget determinístico de ResolutionContext (V3.8/V3.9). Excedido ->
// fail-closed total (context_budget_exceeded), nunca truncamento
// parcial silencioso. Valor de produto/custo, não propriedade de
// corretude — ajustável sem redesenho.
export const MAX_MESSAGE_WINDOW = 500;
export const MAX_ACTIVE_CANDIDATES = 50; // across chains da mesma raiz comercial
export const MAX_CANDIDATES_PER_CHAIN = 50; // V3.10 — soma open+possibly_superseded de uma única chain

// Janela de contexto imediato sempre incluída por inteiro, além dos
// candidatos comunicados abertos (bounded lineage, V3.9/V3.10).
export const RECENT_MESSAGE_WINDOW_SIZE = 20;

export const CLASSIFIER_VERSION = 'v1';
export const CONTEXT_SCHEMA_VERSION = 'v1' as const;
