import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import {
  AI_FEATURE_MEMORY_CONFIRMATION_RECOGNITION,
  MEMORY_CONFIRMATION_RECOGNIZER_MAX_RETRIES,
  MEMORY_CONFIRMATION_RECOGNIZER_MODEL,
} from './config';

// Task #72 — reconhecedor isolado da RESPOSTA da profissional a uma
// pergunta de confirmação de memória já enviada
// (buildMemoryConfirmationQuestion, memory-policy.ts). NUNCA decide se
// há de fato uma confirmação pendente pra esta mensagem responder —
// isso é responsabilidade de quem chama (pipeline.ts), comparando a
// última mensagem de IA real da conversa contra a pergunta
// determinística daquela proposta específica (mesma lição do ADR
// 0010: nunca tratar "existe estado pendente" como prova de
// continuidade, sem checar que a mensagem atual é realmente sobre
// isso). Este módulo só classifica o TEXTO da resposta, pressupondo
// que já foi confirmado que ela é relevante.
//
// Três resultados possíveis, nunca dois: 'confirms' (sim, pode
// guardar), 'rejects' (não, não é isso/não quero), 'ambiguous'
// (resposta não resolve — fala de outra coisa, ou é genuinamente
// indecifrável). 'ambiguous' é o fail-closed de todo o módulo: falha
// total do model, parse inválido, ou dúvida genuína do próprio model
// SEMPRE caem aqui — nunca aprova nem rejeita por engano a partir de
// uma leitura errada. Quando 'ambiguous', quem chama deixa a mensagem
// seguir pelo fluxo normal (Classifier/Planner), nunca insiste
// sozinho numa segunda tentativa de confirmação.

const modelOutputSchema = z.object({
  decision: z.enum(['confirms', 'rejects', 'ambiguous']),
});
export type MemoryConfirmationRecognizerModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as memoryConfirmationRecognizerModelOutputSchema };

export type MemoryConfirmationRecognizerModelCallResult = {
  parsed: MemoryConfirmationRecognizerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type MemoryConfirmationRecognizerModelCall = (params: { instructions: string; input: string }) => Promise<MemoryConfirmationRecognizerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<MemoryConfirmationRecognizerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: MEMORY_CONFIRMATION_RECOGNIZER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, AI_FEATURE_MEMORY_CONFIRMATION_RECOGNITION) },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'A Doopla acabou de perguntar à profissional se pode guardar uma preferência que ela declarou ("Anotei que você disse: ... Posso guardar isso como uma preferência sua, pra eu levar em conta daqui pra frente?"). Você classifica a RESPOSTA dela a esta pergunta específica.',
  '"confirms": ela concorda, de qualquer forma natural (ex.: "sim", "pode", "isso mesmo", "👍", "exatamente, guarda aí").',
  '"rejects": ela nega, corrige, ou diz que não é isso / não quer que guarde (ex.: "não", "não é bem isso", "não precisa anotar", "esquece isso").',
  '"ambiguous": a resposta não resolve a pergunta — ela mudou de assunto, fez outra pergunta, ou a resposta é genuinamente indecifrável como sim/não. Na dúvida real entre confirms/rejects e ambiguous, SEMPRE prefira ambiguous — nunca adivinhe.',
].join('\n');

export type RecognizeMemoryConfirmationReplyResult = {
  decision: 'confirms' | 'rejects' | 'ambiguous';
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste reconhecedor. Nunca lança —
// falha total vira decision='ambiguous' (fail-closed).
export async function recognizeMemoryConfirmationReply(
  messageText: string,
  opts: { modelCall?: MemoryConfirmationRecognizerModelCall; maxRetries?: number } = {}
): Promise<RecognizeMemoryConfirmationReplyResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? MEMORY_CONFIRMATION_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText });

  let parsed: MemoryConfirmationRecognizerModelOutput | null = null;
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

  if (!parsed) return { decision: 'ambiguous', inputTokens, outputTokens };
  return { decision: parsed.decision, inputTokens, outputTokens };
}
