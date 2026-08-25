import type { Intent } from './intents';
import type { ClassificationStatus, ConfidenceLevel, ContextCompleteness } from './types';

// Doopla Intelligence Core v1 — Bloco 3: effectiveConfidence.
//
// O código só pode MANTER ou REBAIXAR a confiança que o model
// reportou (modelConfidence) — nunca aumentar. O model nunca é
// autoridade final sobre confiança; effectiveConfidence é o valor
// autoritativo que o resto do sistema consome.

const RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

export function computeEffectiveConfidence(params: {
  modelConfidence: ConfidenceLevel;
  classificationStatus: ClassificationStatus;
  contextCompleteness: ContextCompleteness;
  requiredRetry: boolean;
  primaryIntent: Intent;
  secondaryIntents: readonly Intent[];
  triggerHasUsableText: boolean;
  shortMessageWithoutContext: boolean;
}): ConfidenceLevel {
  let level = params.modelConfidence;

  const downgrade = (to: ConfidenceLevel) => {
    if (RANK[to] < RANK[level]) level = to;
  };

  // Status diferente de 'classified' (ambiguous) já é o próprio model
  // sinalizando incerteza — nunca confiança alta nesse caso.
  if (params.classificationStatus !== 'classified') downgrade('low');
  // Precisou de retry/correção de schema — a primeira tentativa não
  // saiu limpa, trata como sinal de instabilidade.
  if (params.requiredRetry) downgrade('medium');
  // Fonte relevante que deveria estar disponível mas não pôde ser
  // consultada — nunca confiança alta enquanto isso for verdade.
  if (params.contextCompleteness === 'partial_unavailable') downgrade('medium');
  // Mensagem-gatilho sem conteúdo textual utilizável — não há base
  // real pra uma classificação confiante.
  if (!params.triggerHasUsableText) downgrade('low');
  // Muitos intents secundários simultâneos, ou um primary 'outro'
  // convivendo com secundários concretos — sinal de conflito/
  // ambiguidade que o próprio model pode não ter reconhecido.
  if (params.secondaryIntents.length > 2) downgrade('medium');
  if (params.primaryIntent === 'outro' && params.secondaryIntents.length > 0) downgrade('medium');
  // Mensagem curta (poucas palavras) sem nenhuma mensagem anterior no
  // recorte: mesmo quando o model acerta uma leitura plausível, a base
  // textual é fraca demais pra sustentar confiança alta — o mesmo texto
  // curto costuma admitir mais de uma interpretação razoável quando não
  // há histórico que a desambigue. Regra geral (não é sobre nenhuma
  // frase específica): nunca 'high' nessas condições.
  if (params.shortMessageWithoutContext) downgrade('medium');

  return level;
}
