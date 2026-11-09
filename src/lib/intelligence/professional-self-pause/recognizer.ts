import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MAX_RETRIES, PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL } from './config';
import { PROFESSIONAL_SELF_PAUSE_SIGNALS, type ProfessionalSelfPauseSignal } from './types';

// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
// reconhecedor isolado de pedido de pausa real em professional_self
// ("pare de me escrever", "já chega", "não precisa mais responder" e
// equivalentes). Mesma disciplina de recognizeDelegatedContactRequest:
// um model call pequeno e dedicado, schema fechado, NUNCA decide nada
// por si só (quem decide é o código em pipeline.ts, a partir do
// signal). Reconhece por COMPREENSÃO SEMÂNTICA, nunca por lista fixa
// de frases — requisito explícito da fundadora (mensagem "MUDANÇA
// FUNDAMENTAL NA ARQUITETURA DE INTELIGÊNCIA", 20/10/2026).
//
// Diferença deliberada do padrão de outros reconhecedores: aqui a
// falha TOTAL do model (timeout/erro/parse inválido) devolve signal=null
// — NUNCA um valor concreto (nem 'pause_requested' nem 'no_signal').
// Isto é intencional: 'no_signal' confiante faz pipeline.ts REABRIR
// uma conversa pausada (retomada automática); se o model falhar de
// verdade, o código nunca pode interpretar isso como "ela não pediu
// pausa" — o risco de uma falha técnica reabrir indevidamente um
// "pare de me escrever" já reconhecido antes é maior do que o risco de
// manter um estado inalterado por um ciclo. null significa sempre
// "não mude nada", nunca "ela não pediu".

const modelOutputSchema = z.object({
  signal: z.enum(PROFESSIONAL_SELF_PAUSE_SIGNALS),
});
export type ProfessionalSelfPauseRecognizerModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as professionalSelfPauseRecognizerModelOutputSchema };

export type ProfessionalSelfPauseRecognizerModelCallResult = {
  parsed: ProfessionalSelfPauseRecognizerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de recognizer.ts/extractor.ts/detector.ts/plan.ts/classify.ts.
export type ProfessionalSelfPauseRecognizerModelCall = (params: { instructions: string; input: string }) => Promise<ProfessionalSelfPauseRecognizerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<ProfessionalSelfPauseRecognizerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'professional_self_pause_recognition') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Você reconhece, numa mensagem que uma profissional mandou pra própria Doopla (conversa professional_self — a assistente de IA dela, nunca um cliente), se ela está pedindo pra Doopla PARAR DE MANDAR MENSAGENS AUTOMÁTICAS pra ela pelo WhatsApp.',
  'signal="pause_requested": a profissional pede, de qualquer forma que o SIGNIFICADO deixe claro, pra Doopla parar de escrever/responder/mandar mensagem pra ela agora. Reconheça pelo SENTIDO da frase, nunca por uma lista fixa de palavras — isso inclui frases diretas ("pare de me escrever", "não me manda mais nada", "já chega", "para de responder", "pode parar") e frases menos diretas mas com o mesmo sentido claro ("deixa quieto por agora", "não precisa responder mais isso", "some um pouco"). Na dúvida genuína sobre se o sentido é realmente esse, prefira signal="no_signal" — é sempre mais seguro deixar a conversa seguir normal do que pausar sem um pedido claro.',
  'signal="no_signal": qualquer outra mensagem — perguntas, comentários, pedidos normais, ou qualquer coisa que não seja claramente um pedido pra parar de mandar mensagem. Esta é a resposta padrão pra praticamente toda mensagem.',
  'Nunca confunda um pedido de pausa com a profissional pedindo pra Doopla parar de fazer uma AÇÃO ESPECÍFICA (ex.: "para de perguntar isso", "não precisa confirmar de novo", "esquece esse pedido") — isso é sobre um assunto específico, não sobre parar de responder no geral. Só use pause_requested quando o pedido é claramente sobre PARAR DE ESCREVER/RESPONDER NO GERAL.',
].join('\n');

export type RecognizePauseRequestResult = {
  // null = falha total do model — NUNCA interpretado como "ela não
  // pediu pausa" pelo chamador (ver comentário no topo do arquivo).
  signal: ProfessionalSelfPauseSignal | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste reconhecedor.
export async function recognizeProfessionalSelfPauseRequest(
  messageText: string,
  opts: { modelCall?: ProfessionalSelfPauseRecognizerModelCall; maxRetries?: number } = {}
): Promise<RecognizePauseRequestResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? PROFESSIONAL_SELF_PAUSE_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText });

  let parsed: ProfessionalSelfPauseRecognizerModelOutput | null = null;
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
      // Engolido de propósito, mesmo padrão do resto do projeto — a
      // próxima tentativa (ou o retorno signal=null) cobre a falha.
    }
  }

  return { signal: parsed?.signal ?? null, inputTokens, outputTokens };
}
