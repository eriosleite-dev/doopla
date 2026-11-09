// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// configuração, isolada da config de Planner/Classifier/Policy Gate/
// Approval Engine/Inbound Proposal (mesmo raciocínio de todos os
// blocos anteriores — nunca a mesma constante por acidente, nunca o
// mesmo model call reaproveitado entre módulos com contratos
// diferentes).
//
// gpt-5-mini mantido por continuidade — NÃO é assumido como modelo
// definitivo de produção (mesma ressalva dos outros blocos).
export const DELEGATED_CONTACT_RECOGNIZER_MODEL = 'gpt-5-mini';
export const AI_FEATURE_DELEGATED_CONTACT_RECOGNITION = 'delegated_contact_recognition';
export const DELEGATED_CONTACT_RECOGNIZER_MAX_RETRIES = 1;

export const RECIPIENT_CONSENT_CHECK_MODEL = 'gpt-5-mini';
export const AI_FEATURE_RECIPIENT_CONSENT_CHECK = 'delegated_contact_recipient_consent_check';
export const RECIPIENT_CONSENT_CHECK_MAX_RETRIES = 1;

// Prazo padrão sem resposta do destinatário (requisito da fundadora,
// 14/10/2026) — gravado por linha no momento da execução do template
// (mark_pending_delegated_contact_executed, migration 0109), nunca
// relido daqui depois disso. Único ponto de ajuste pra uma mudança
// futura de produto (ainda não configurável por profissional/UI —
// requisito explícito de que isso fique fácil de mudar depois).
export const DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS = 72;
