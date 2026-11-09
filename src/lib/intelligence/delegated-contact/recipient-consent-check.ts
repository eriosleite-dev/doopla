import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { RECIPIENT_CONSENT_CHECK_MAX_RETRIES, RECIPIENT_CONSENT_CHECK_MODEL } from './config';
import { RECIPIENT_CONSENT_OUTCOMES, type RecipientConsentOutcome } from './types';

// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// checagem de consentimento do DESTINATÁRIO. Lê a 1ª resposta real de
// alguém que a Doopla contatou proativamente (a pedido da profissional)
// e decide se o texto literal que a profissional pediu pode seguir.
//
// Requisito explícito da fundadora: "se houver recusa, pedido para não
// receber mensagens ou bloqueio, não enviar" — e, por extensão, nunca
// enviar também quando a resposta é ambígua (o único jeito seguro de
// tratar "não tenho certeza se ele topa" é NUNCA assumir que sim).
// Especificamente por isso este módulo tem só 3 saídas, nunca um
// booleano: proceed (claramente positiva/neutra-receptiva),
// declined (recusa/pedido pra não contatar/bloqueio claro), ambiguous
// (qualquer outra coisa — inclusive perguntas, desconfiança,
// confusão). SÓ proceed libera o envio automático; ambiguous sempre
// pausa pra revisão humana da profissional (delegated-contact-flow.ts),
// nunca assume positivo por omissão.
//
// Falha total do model -> SEMPRE ambiguous, nunca proceed (fail-closed:
// pior caso é esperar a profissional decidir manualmente, nunca enviar
// sem consentimento verificado).

const modelOutputSchema = z.object({
  outcome: z.enum(RECIPIENT_CONSENT_OUTCOMES),
});
export type RecipientConsentCheckModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as recipientConsentCheckModelOutputSchema };

export type RecipientConsentCheckModelCallResult = {
  parsed: RecipientConsentCheckModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type RecipientConsentCheckModelCall = (params: { instructions: string; input: string }) => Promise<RecipientConsentCheckModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<RecipientConsentCheckModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: RECIPIENT_CONSENT_CHECK_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'recipient_consent_check') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Alguém recebeu uma mensagem de apresentação da Doopla dizendo que uma profissional gostaria de conversar sobre uma possível contratação, e pode responder por ali. Você recebe a PRIMEIRA resposta real dessa pessoa (replyText).',
  'Sua única tarefa: essa resposta permite que a Doopla prossiga e envie a mensagem de verdade que a profissional preparou?',
  'outcome="declined": a resposta é uma recusa clara, um pedido explícito pra não ser contatado/não receber mensagens, uma reclamação de spam, ou qualquer indicação de bloqueio/incômodo (ex.: "não tenho interesse", "para de mandar mensagem", "quem autorizou isso?", "não me contate mais", "errado, não conheço vocês").',
  'outcome="proceed": a resposta é receptiva, neutra-positiva, ou simplesmente responde normalmente ao convite de conversar (ex.: "oi, pode falar", "quem é?", "sim, me fala", "ok", qualquer pergunta de esclarecimento feita de boa-fé que não seja recusa).',
  'outcome="ambiguous": QUALQUER outro caso — resposta confusa, fora de contexto, que você não tem certeza suficiente pra classificar como claramente receptiva ou claramente uma recusa. Na dúvida, SEMPRE escolha ambiguous — nunca proceed por omissão. Enviar a mensagem sem certeza de consentimento é pior do que pausar pra revisão humana.',
  'Nunca infira nada alem do texto desta resposta — sem contexto de conversa, sem histórico, só o que esta mensagem literalmente diz.',
].join('\n');

export type RecipientConsentCheckResult = {
  outcome: RecipientConsentOutcome;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste módulo. Nunca lança — falha
// total vira outcome="ambiguous" (nunca "proceed": ver comentário no
// topo do arquivo).
export async function checkRecipientConsent(
  replyText: string,
  opts: { modelCall?: RecipientConsentCheckModelCall; maxRetries?: number } = {}
): Promise<RecipientConsentCheckResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? RECIPIENT_CONSENT_CHECK_MAX_RETRIES;
  const input = JSON.stringify({ replyText });

  let parsed: RecipientConsentCheckModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions: INSTRUCTIONS, input });
      // Head of AI (15/10/2026) — mesmo achado/mesma correção de
      // classification/classify.ts: soma null-safe em vez de
      // sobrescrever, nunca subconta tokens de tentativas anteriores
      // já cobradas pela OpenAI.
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

  if (!parsed) {
    return { outcome: 'ambiguous', inputTokens, outputTokens };
  }

  return { outcome: parsed.outcome, inputTokens, outputTokens };
}
