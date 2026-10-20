import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { CONVERSATION_FEEDBACK_RECOGNIZER_MAX_RETRIES, CONVERSATION_FEEDBACK_RECOGNIZER_MODEL } from './config';
import { CONVERSATION_FEEDBACK_SIGNALS, type ConversationFeedbackSignal } from './types';

// ADR 0011 (20/10/2026) — Fase A do sistema de evolução contínua:
// reconhecedor isolado de feedback semântico em professional_self
// ("Erro", "Você não entendeu", "Perfeito!", "Essa negociação foi
// ótima" e equivalentes). Mesma disciplina de todos os outros
// reconhecedores do projeto: model call pequeno e dedicado, schema
// fechado, NUNCA decide nada por si só — quem decide é o código em
// pipeline.ts (gravar ou não, mandar confirmação ou não). Reconhece
// por COMPREENSÃO SEMÂNTICA, nunca por lista fixa de frases.
//
// Falha total do model -> sempre no_signal, nunca negative/positive —
// aqui, diferente do recognizer de pausa (ADR 0009), não existe
// assimetria de risco real entre os dois sentidos de erro (uma falha
// técnica nunca grava um feedback, de qualquer jeito — o pior caso é
// "não registrou esta mensagem", nunca "registrou um feedback que não
// existiu").

const modelOutputSchema = z.object({
  signal: z.enum(CONVERSATION_FEEDBACK_SIGNALS),
});
export type ConversationFeedbackRecognizerModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as conversationFeedbackRecognizerModelOutputSchema };

export type ConversationFeedbackRecognizerModelCallResult = {
  parsed: ConversationFeedbackRecognizerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio do resto do projeto.
export type ConversationFeedbackRecognizerModelCall = (params: { instructions: string; input: string }) => Promise<ConversationFeedbackRecognizerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<ConversationFeedbackRecognizerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: CONVERSATION_FEEDBACK_RECOGNIZER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'conversation_feedback_recognition') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Você reconhece, numa mensagem que uma profissional mandou pra própria Doopla (conversa professional_self — a assistente de IA dela, nunca um cliente), se ela está dando FEEDBACK sobre o desempenho da própria Doopla: uma resposta, uma negociação que a Doopla conduziu, ou o jeito que ela se comunicou.',
  'signal="negative": a profissional sinaliza que a Doopla entendeu errado, respondeu errado, inventou algo, ou não fez o que deveria — reconheça pelo SENTIDO, nunca por uma lista fixa de palavras. Isso inclui sinais diretos ("erro", "isso está errado", "você não entendeu") e indiretos mas claros ("não foi isso que eu perguntei", "isso não existe", "você está confundindo", "já te falei isso").',
  'signal="positive": a profissional elogia explicitamente o desempenho da Doopla — uma resposta, o jeito que conduziu uma negociação ou conversa ("perfeito!", "é assim que eu quero que responda", "essa negociação foi ótima", "muito bom isso").',
  'signal="no_signal": qualquer outra mensagem — perguntas, pedidos normais, comentários sobre o PRÓPRIO trabalho/vida da profissional (nunca sobre a Doopla), ou elogio/crítica genuinamente ambíguo demais pra classificar com segurança. Esta é a resposta padrão pra praticamente toda mensagem.',
  'Nunca confunda feedback sobre a DOOPLA com a profissional comentando sobre o PRÓPRIO trabalho ou sobre terceiros (ex.: "o show foi ótimo", "o cliente foi grosso" — isso é sobre a vida dela, nunca sobre a Doopla, a menos que o contexto deixe claro que ela está avaliando como a DOOPLA conduziu algo).',
  'Na dúvida genuína entre no_signal e negative/positive, prefira no_signal — é sempre mais seguro deixar passar um feedback real sem registrar do que registrar um falso positivo.',
].join('\n');

export type RecognizeConversationFeedbackResult = {
  signal: ConversationFeedbackSignal;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste reconhecedor. Nunca lança —
// falha total vira signal="no_signal" (fail-closed: nunca grava um
// feedback sem reconhecimento real).
export async function recognizeConversationFeedback(
  messageText: string,
  // Última resposta de IA nesta conversation, quando houver — contexto
  // mínimo pra ajudar o model a saber O QUE está sendo elogiado/
  // criticado, nunca usado como evidência citável.
  lastAiResponseText: string | null,
  opts: { modelCall?: ConversationFeedbackRecognizerModelCall; maxRetries?: number } = {}
): Promise<RecognizeConversationFeedbackResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? CONVERSATION_FEEDBACK_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText, lastAiResponseText });

  let parsed: ConversationFeedbackRecognizerModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions: INSTRUCTIONS, input });
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

  return { signal: parsed?.signal ?? 'no_signal', inputTokens, outputTokens };
}
