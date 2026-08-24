import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { ContextPackage } from '../context-builder';
import { getOpenAIClient } from '../openai-client';
import type { ToolContext } from '../types';
import { buildClassificationContext } from './classification-context';
import { CLASSIFIER_MAX_RETRIES, CLASSIFIER_MODEL } from './config';
import { routeCompetencies } from './competencies';
import { computeContextCompleteness } from './completeness';
import { computeEffectiveConfidence } from './confidence';
import { INTENTS } from './intents';
import { buildClassificationInstructions } from './prompt';
import type { IntentClassification } from './types';

// Doopla Intelligence Core v1 — Bloco 3: Intent Classifier.
//
// O schema que o MODEL preenche é deliberadamente menor que
// IntentClassification: sem relevantCompetencies (só o
// CompetenceRouter, em código, preenche isso) e sem 'invalid' em
// classificationStatus ('invalid' só é decidido por código, quando a
// saída do model nunca chega a validar de verdade).
const modelOutputSchema = z.object({
  classificationStatus: z.enum(['classified', 'ambiguous']),
  primaryIntent: z.enum(INTENTS),
  secondaryIntents: z.array(z.enum(INTENTS)),
  modelConfidence: z.enum(['high', 'medium', 'low']),
});
export type ModelClassificationOutput = z.infer<typeof modelOutputSchema>;

export type ClassifierModelCallResult = {
  parsed: ModelClassificationOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de dependência explícita já usado em
// ToolContext.supabase (Bloco 1/2): torna classify.ts testável sem
// rede, e mantém a chamada real isolada num único ponto.
export type ClassifierModelCall = (params: { instructions: string; input: string }) => Promise<ClassifierModelCallResult>;

async function defaultModelCall({
  instructions,
  input,
}: {
  instructions: string;
  input: string;
}): Promise<ClassifierModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: CLASSIFIER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'intent_classification') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

export type ClassifyResult = {
  classification: IntentClassification;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de entrada. Recebe o ContextPackage JÁ montado pelo
// Context Builder — nunca monta contexto próprio, nunca chama tool
// nova, nunca resolve ActorContext sozinho. Nunca lança: qualquer
// falha (rede, timeout, parsing) cai no fallback determinístico
// abaixo, nunca propaga a mensagem crua do SDK/model pra fora deste
// módulo.
export async function classifyIntent(
  toolCtx: ToolContext,
  contextPackage: ContextPackage,
  opts: { modelCall?: ClassifierModelCall; maxRetries?: number } = {}
): Promise<ClassifyResult> {
  const classificationContext = buildClassificationContext(contextPackage, toolCtx.conversation);
  const instructions = buildClassificationInstructions();
  const input = JSON.stringify(classificationContext);
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? CLASSIFIER_MAX_RETRIES;

  let parsed: ModelClassificationOutput | null = null;
  let requiredRetry = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) requiredRetry = true;
    try {
      const result = await modelCall({ instructions, input });
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      if (result.parsed) {
        parsed = result.parsed;
        break;
      }
    } catch {
      // Engolido de propósito — nunca propaga a mensagem crua do
      // SDK pra fora deste módulo. Se todas as tentativas falharem,
      // cai no fallback determinístico abaixo.
    }
  }

  const triggerHasUsableText = !!classificationContext.triggerMessage?.text?.trim();

  if (!parsed) {
    // Falha real de classificação (nunca "outro" legítimo confundido
    // com isto) — fecha em invalid/low, sem inventar.
    const contextCompleteness = computeContextCompleteness('outro', [], contextPackage);
    return {
      classification: {
        classificationStatus: 'invalid',
        primaryIntent: 'outro',
        secondaryIntents: [],
        modelConfidence: 'low',
        effectiveConfidence: 'low',
        contextCompleteness,
        relevantCompetencies: [],
      },
      inputTokens,
      outputTokens,
    };
  }

  // Achado de auditoria adversarial: o model pode devolver
  // secondaryIntents com duplicatas, ou repetindo o próprio
  // primaryIntent como se fosse secundário — nem o zod nem o schema
  // impedem isso (é uma lista solta de enum, sem exigir unicidade).
  // Sem sanear isso, três coisas quebravam: a união de competências
  // (inofensiva, já deduplicada pelo Set) escondia o problema real —
  // a heurística "muitos secondaryIntents" em confidence.ts contava
  // duplicatas como sinal de ambiguidade genuína (um model
  // repetindo/travando no mesmo valor N vezes derrubava a confiança
  // por um motivo que não existiu), e o registro em observability
  // ficava com ruído redundante. Sempre saneado ANTES de qualquer
  // outro cálculo — nunca o array cru do model chega a
  // completeness/confidence/competências/observability.
  const secondaryIntents = Array.from(new Set(parsed.secondaryIntents)).filter((i) => i !== parsed.primaryIntent);

  const contextCompleteness = computeContextCompleteness(parsed.primaryIntent, secondaryIntents, contextPackage);
  const effectiveConfidence = computeEffectiveConfidence({
    modelConfidence: parsed.modelConfidence,
    classificationStatus: parsed.classificationStatus,
    contextCompleteness,
    requiredRetry,
    primaryIntent: parsed.primaryIntent,
    secondaryIntents,
    triggerHasUsableText,
  });

  return {
    classification: {
      classificationStatus: parsed.classificationStatus,
      primaryIntent: parsed.primaryIntent,
      secondaryIntents,
      modelConfidence: parsed.modelConfidence,
      effectiveConfidence,
      contextCompleteness,
      // Único lugar que preenche relevantCompetencies — sempre código,
      // nunca o model (o schema dele nem tem esse campo).
      relevantCompetencies: routeCompetencies([parsed.primaryIntent, ...secondaryIntents]),
    },
    inputTokens,
    outputTokens,
  };
}
