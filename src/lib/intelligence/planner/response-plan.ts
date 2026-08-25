// Doopla Intelligence Core v1 — Bloco 4: vocabulário de ResponsePlan.
//
// Representa só a intenção do PRÓXIMO PASSO — nunca uma ação
// realizada. Nenhum destes valores executa, envia ou muda estado.
//
// wait_for_external_participant/wait_for_professional ficam no
// contrato (pra não quebrar quem consumir este tipo mais adiante),
// mas o Planner v1 nunca pode selecioná-los de verdade: exigem prova
// de que já perguntamos e estamos esperando uma resposta específica —
// isso é Pending Work, que não existe ainda. Por isso o schema que o
// MODEL preenche usa PLANNER_MODEL_RESPONSE_PLANS (só 6 valores,
// exclui os dois estados de espera) — estruturalmente impossível do
// model devolvê-los, não uma checagem em runtime pra descartar.
export const RESPONSE_PLANS = [
  'answer_with_known_information',
  'acknowledge',
  'ask_external_participant',
  'consult_professional',
  'wait_for_external_participant',
  'wait_for_professional',
  'clarify_ambiguity',
  'no_response_needed',
] as const;

export type ResponsePlan = (typeof RESPONSE_PLANS)[number];

// Subconjunto que o model pode de fato propor neste bloco.
export const PLANNER_MODEL_RESPONSE_PLANS = [
  'answer_with_known_information',
  'acknowledge',
  'ask_external_participant',
  'consult_professional',
  'clarify_ambiguity',
  'no_response_needed',
] as const;

export type PlannerModelResponsePlan = (typeof PLANNER_MODEL_RESPONSE_PLANS)[number];
