// Doopla Intelligence Core v1 — Bloco 3: taxonomia de Intent.
//
// Vocabulário controlado e pequeno, de propósito extensível — ajustar
// a lista é mudar este arquivo, nunca uma instrução de prompt que o
// model pudesse ignorar. `outro` é uma resposta legítima, não uma
// válvula de erro (ver classification/types.ts pra ClassificationStatus,
// que é quem carrega "falha de classificação").
export const INTENTS = [
  'orcamento',
  'disponibilidade',
  'desconto',
  'condicao_pagamento',
  'logistica',
  'rider',
  'contrato',
  'cobranca',
  'material_profissional',
  'reclamacao',
  'suporte',
  // Comunicação sobre um trabalho já combinado/fechado ou informação
  // operacional nova sobre ele (ex.: "fechei um trabalho sábado por
  // R$3000") — mesmo que nenhuma ação seja tomada neste bloco.
  'booking_update',
  // Estado/acontecimento FINANCEIRO de um trabalho já existente — nunca
  // negociação de preço/condição (isso continua em orcamento/desconto/
  // condicao_pagamento), nunca nota fiscal (cobranca), nunca o fato do
  // trabalho em si mudando (booking_update). Ex.: "recebi metade", "o
  // sinal foi pago", "ainda faltam R$800". Ver prompt.ts pra a fronteira
  // completa entre estes 5 — achado real de lacuna de taxonomia na
  // auditoria adversarial do Bloco 3, corrigido aqui de propósito (não
  // silenciosamente).
  'financeiro_booking',
  'treinamento_profissional',
  'outro',
] as const;

export type Intent = (typeof INTENTS)[number];
