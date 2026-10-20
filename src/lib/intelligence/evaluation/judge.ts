import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { AI_FEATURE_CONVERSATION_EVALUATION, EVALUATION_JUDGE_MAX_RETRIES, EVALUATION_JUDGE_MODEL } from './config';
import { EVALUATION_FAILURE_CATEGORIES, type EvaluationInput, type EvaluationFailureCategory, type EvaluationVerdict } from './types';

// ADR 0011 (Fase A->B, 20/10/2026) — juiz isolado da avaliação
// automática. Mesma disciplina de todo recognizer do projeto: model
// call pequeno e dedicado, schema fechado, NUNCA decide nada por si
// só (não aprova, não revoga, não envia nada — só produz um veredito
// pra revisão supervisionada, mesmo espírito de "MEMÓRIA NUNCA É
// AUTORIZAÇÃO" aplicado aqui como "VEREDITO NUNCA É AÇÃO AUTOMÁTICA").
//
// Diferença estrutural dos outros recognizers: a falha segura de um
// recognizer de AÇÃO é "não fazer nada" (ex.: no_delegation_signal).
// Pra um JUIZ, "não fazer nada" seria classificar como 'ok' por
// default — exatamente o resultado mais perigoso de um juiz com bug
// (esconderia falhas reais). Por isso o fail-closed aqui é um
// terceiro estado, 'inconclusive' — nunca 'ok' nem 'failure' quando o
// model falha ou a resposta não pôde ser interpretada; 'inconclusive'
// força revisão humana, nunca finge uma conclusão que não existe.
//
// Taxonomia de categorias (types.ts) derivada dos incidentes REAIS já
// documentados nesta sessão (ADR 0007/0008/0009/0010) — nunca
// inventada, exatamente pra permitir validar o juiz contra casos de
// ground truth conhecido (ver incident-fixtures.ts) antes de apontá-lo
// pra dados reais de produção (Fase B, ainda não ligada a nada).

const modelOutputSchema = z.object({
  verdict: z.enum(['ok', 'failure']),
  // Só relevante quando verdict='failure' — o código nunca confia
  // neste campo fora disso.
  failureCategory: z.enum(EVALUATION_FAILURE_CATEGORIES).nullable(),
  reasoning: z.string(),
});
export type EvaluationJudgeModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as evaluationJudgeModelOutputSchema };

export type EvaluationJudgeModelCallResult = {
  parsed: EvaluationJudgeModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type EvaluationJudgeModelCall = (params: { instructions: string; input: string }) => Promise<EvaluationJudgeModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<EvaluationJudgeModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: EVALUATION_JUDGE_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, AI_FEATURE_CONVERSATION_EVALUATION) },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Você avalia se a resposta da Doopla (uma IA que representa profissionais de eventos/música em conversas) foi adequada, dado o histórico completo da conversa até aquele ponto. Você NUNCA decide nenhuma ação — só produz um veredito pra revisão humana.',
  '"ok": a resposta (ou a ausência de resposta, quando genuinamente nada precisava ser respondido ainda) foi razoável dado o contexto.',
  '"failure": a resposta foi claramente inadequada — perdeu o contexto da conversa, respondeu a pergunta errada, não respondeu quando deveria, violou uma regra que devia ter sido aplicada, ou usou tom/identidade errados.',
  `Quando verdict="failure", escolha EXATAMENTE uma categoria entre: ${EVALUATION_FAILURE_CATEGORIES.join(', ')}. "context_loss" = usou informação antiga/de outro assunto que não tinha conexão com a pergunta atual. "queue_or_delivery_failure" = a mensagem nunca foi respondida, ou foi respondida de forma repetida/em loop. "wrong_intent_or_plan" = entendeu mal o que estava sendo pedido, ou respondeu só parte de uma mensagem com vários assuntos. "policy_violation" = assumiu/confirmou algo que precisava de aprovação explícita antes. "identity_or_tone_mismatch" = se identificou errado, ou usou um tom/oferta fora do papel esperado. "unanswered" = nenhuma resposta foi gerada quando uma era esperada. "other" = falha real que não se encaixa nas anteriores.`,
  'Na dúvida genuína entre "ok" e "failure", prefira "ok" — você é um juiz conservador: falsos positivos de falha desperdiçam revisão humana em algo que não era problema. Mas nunca marque "ok" só porque a resposta existe; ausência de resposta a uma pergunta direta é "failure"/"unanswered", não "ok".',
  'reasoning: 1-2 frases explicando seu veredito, sempre citando o que no histórico sustenta sua conclusão.',
].join('\n');

export type EvaluateConversationOutcomeResult = {
  verdict: EvaluationVerdict;
  failureCategory: EvaluationFailureCategory | null;
  reasoning: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste juiz. Nunca lança — falha
// total vira verdict='inconclusive' (fail-closed: nunca finge um
// veredito que não existe).
export async function evaluateConversationOutcome(
  input: EvaluationInput,
  opts: { modelCall?: EvaluationJudgeModelCall; maxRetries?: number } = {}
): Promise<EvaluateConversationOutcomeResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? EVALUATION_JUDGE_MAX_RETRIES;
  const serializedInput = JSON.stringify(input);

  let parsed: EvaluationJudgeModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions: INSTRUCTIONS, input: serializedInput });
      if (result.inputTokens !== null) inputTokens = (inputTokens ?? 0) + result.inputTokens;
      if (result.outputTokens !== null) outputTokens = (outputTokens ?? 0) + result.outputTokens;
      if (result.parsed) {
        parsed = result.parsed;
        break;
      }
    } catch {
      // Engolido de propósito, mesmo padrão do resto do projeto.
    }
  }

  if (!parsed) return { verdict: 'inconclusive', failureCategory: null, reasoning: null, inputTokens, outputTokens };

  // Guarda estrutural: verdict='failure' sem failureCategory válida
  // nunca sobrevive como 'failure' — um veredito de falha sem
  // categoria não é auditável, cai pra inconclusive em vez de fingir
  // uma categoria arbitrária.
  if (parsed.verdict === 'failure' && !parsed.failureCategory) {
    return { verdict: 'inconclusive', failureCategory: null, reasoning: parsed.reasoning, inputTokens, outputTokens };
  }

  return {
    verdict: parsed.verdict,
    failureCategory: parsed.verdict === 'failure' ? parsed.failureCategory : null,
    reasoning: parsed.reasoning,
    inputTokens,
    outputTokens,
  };
}
