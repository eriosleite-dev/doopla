// Doopla Intelligence Core v1 — extrator de proposta inbound:
// configuração isolada, nunca reaproveita constante de outro bloco por
// acidente (mesmo raciocínio de policy-gate-post/config.ts).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva dos outros blocos).
export const INBOUND_PROPOSAL_MODEL = 'gpt-5-mini';
export const AI_FEATURE_INBOUND_PROPOSAL_DETECTION = 'inbound_proposal_detection';
export const INBOUND_PROPOSAL_MAX_RETRIES = 1;

// Versão do classificador — gravada em toda communicated_proposal_candidates.classifier_version
// (migration 0045/0047). Mudar a lógica de extração no futuro sempre
// incrementa isto.
export const INBOUND_PROPOSAL_CLASSIFIER_VERSION = 'inbound-proposal-v1';

// Mesma higiene estrutural de MAX_EXTRACTED_COMMITMENTS (policy-gate-post/config.ts).
export const MAX_DETECTED_PROPOSALS = 20;
