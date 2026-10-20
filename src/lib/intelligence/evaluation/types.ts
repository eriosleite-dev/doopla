// ADR 0011 (Fase A->B, 20/10/2026) — laboratório de avaliação
// contínua: taxonomia de categorias de falha NUNCA inventada do zero —
// cada categoria mapeia direto pra um incidente real já documentado
// nesta sessão (ver comentário em judge.ts), exatamente pra poder
// validar o juiz contra casos de ground truth conhecido antes de
// confiar nele em dados reais (Fase B).

export const EVALUATION_FAILURE_CATEGORIES = [
  // ADR 0010 — delegação antiga/estado assíncrono respondendo a
  // pergunta atual errada; "memória"/estado antigo vazando sem
  // conexão com a intenção atual da mensagem.
  'context_loss',
  // ADR 0008/0009 — mensagem nunca chegou a gerar resposta, ou
  // resposta repetida/em loop por falha de fila/envio.
  'queue_or_delivery_failure',
  // ADR 0007 P0.2/P1 — Classifier/Planner interpretaram mal a
  // intenção, ou endereçaram só parte de uma mensagem multi-assunto.
  'wrong_intent_or_plan',
  // Post-model Policy Gate deveria ter bloqueado e não bloqueou, ou
  // bloqueou algo que não devia.
  'policy_violation',
  // ADR 0007 P0.1 — identidade/tom incorretos (ex.: assinou como outra
  // pessoa, ofereceu exemplo não pedido, texto fora do papel da Doopla).
  'identity_or_tone_mismatch',
  // Nenhuma resposta foi gerada quando deveria ter sido.
  'unanswered',
  'other',
] as const;
export type EvaluationFailureCategory = (typeof EVALUATION_FAILURE_CATEGORIES)[number];

export const EVALUATION_VERDICTS = ['ok', 'failure', 'inconclusive'] as const;
export type EvaluationVerdict = (typeof EVALUATION_VERDICTS)[number];

export type EvaluationTranscriptMessage = {
  authorType: 'professional' | 'external_participant' | 'ai';
  text: string;
};

export type EvaluationInput = {
  // Histórico completo até a mensagem-gatilho, na ordem real —
  // nunca só a última mensagem (o juiz precisa do mesmo contexto que
  // o Runtime teve, senão julgaria "fora de contexto" o que na
  // verdade foi uma resposta correta a algo mais antigo).
  transcript: EvaluationTranscriptMessage[];
  // O que a Doopla de fato fez/respondeu neste turno — texto da
  // resposta, ou null quando nenhuma resposta foi gerada
  // (explicitamente distinto de string vazia).
  finalAiAction: string | null;
};
