// Doopla Intelligence Core v1 — Bloco 3: configuração do Intent
// Classifier, centralizada e isolada da config geral do Core — o
// modelo de classificação pode divergir do modelo de resposta no
// futuro, nunca a mesma constante por acidente.
//
// gpt-5-mini mantido por continuidade com o teste de infraestrutura já
// validado (Structured Outputs suportado, tarefa estreita, baseline
// de custo/qualidade) — NÃO é assumido como modelo definitivo de
// produção; um benchmark entre modelos adequados pra classificação
// está previsto antes do beta.
export const CLASSIFIER_MODEL = 'gpt-5-mini';

export const AI_FEATURE_INTENT_CLASSIFICATION = 'intent_classification';

// Uma única tentativa extra além da original — o suficiente pra
// absorver uma falha transitória de parsing/schema sem custear
// retries indefinidos. requiredRetry (ver classification/confidence.ts)
// já rebaixa a confiança quando isso acontece.
export const CLASSIFIER_MAX_RETRIES = 1;
