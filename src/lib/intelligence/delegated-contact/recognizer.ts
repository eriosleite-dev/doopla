import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { DELEGATED_CONTACT_RECOGNIZER_MAX_RETRIES, DELEGATED_CONTACT_RECOGNIZER_MODEL } from './config';
import { DELEGATED_CONTACT_SIGNALS, type ActiveDelegatedContactSummary, type DelegatedContactSignal } from './types';

// Doopla Intelligence Core v1 — "Doopla chama o cliente" (Etapa 2.1):
// reconhecedor isolado de pedidos de delegação em professional_self.
//
// NUNCA o Classifier, NUNCA o Planner — mesma disciplina de
// extractCommitments/detectInboundProposal: um model call pequeno e
// dedicado, schema fechado, nunca decide nada por si só (quem decide é
// o código determinístico em delegated-contact-flow.ts, a partir do
// signal + do estado real já persistido). Falha total do model
// (timeout/erro/parse inválido) -> SEMPRE no_delegation_signal — nunca
// inventa uma ação de delegação; pior caso é "não reconheceu o pedido
// desta vez", nunca "executou algo sem pedido real".
//
// Input DELIBERADAMENTE mínimo: só o texto da mensagem-gatilho + um
// resumo do pedido ativo/recente desta MESMA profissional (nunca
// histórico de conversa, nunca contexto comercial, nunca dado de outra
// profissional) — mesmo princípio de provenance estrita de
// detectInboundProposal.

const modelOutputSchema = z.object({
  signal: z.enum(DELEGATED_CONTACT_SIGNALS),
  // Só relevantes pra signal='new_request'/'provides_missing_info' —
  // o código nunca confia nestes campos fora desses dois signals
  // (recognizeDelegatedContactRequest já zera o resto abaixo).
  recipientName: z.string().nullable(),
  recipientNumber: z.string().nullable(),
  purposeSummary: z.string().nullable(),
  draftMessageContent: z.string().nullable(),
});
export type DelegatedContactRecognizerModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as delegatedContactRecognizerModelOutputSchema };

export type DelegatedContactRecognizerModelCallResult = {
  parsed: DelegatedContactRecognizerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de extractor.ts/detector.ts/plan.ts/classify.ts.
export type DelegatedContactRecognizerModelCall = (params: { instructions: string; input: string }) => Promise<DelegatedContactRecognizerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<DelegatedContactRecognizerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: DELEGATED_CONTACT_RECOGNIZER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'delegated_contact_recognition') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Você reconhece, numa mensagem que uma profissional mandou pra própria Doopla (conversa professional_self, nunca o cliente), se ela está pedindo pra Doopla CONTATAR PROATIVAMENTE um terceiro (cliente/contato dela) em nome dela — a funcionalidade "Doopla chama o cliente".',
  'Isso é DIFERENTE de qualquer outro assunto da profissional com a Doopla (perguntas sobre a plataforma, sobre os próprios compromissos, etc.) — se a mensagem não tem relação alguma com pedir/confirmar/cancelar um contato proativo com terceiro, devolva signal="no_delegation_signal" e todos os outros campos null.',
  'signal="new_request": a profissional está pedindo, por ela mesma, pra Doopla contatar alguém (ex.: "manda uma mensagem pro Fulano", "quero que você fale com a cliente tal"). Extraia o que estiver literalmente na mensagem: recipientName, recipientNumber (só se o número já veio junto), purposeSummary (um resumo curto do motivo do contato) e draftMessageContent (o texto EXATO que ela quer que seja enviado, se ela já disse — nunca invente ou reescreva, null se ela não especificou o texto ainda).',
  'signal="provides_missing_info": só use quando já existe um pedido ativo faltando informação (activeRequest.status indica isso) e esta mensagem fornece exatamente o que faltava (número de telefone, ou o texto a enviar) — nunca um pedido novo.',
  'signal="confirms_pending": só use quando activeRequest.pendingConfirmationText não é null (existe uma pergunta de confirmação pendente) E esta mensagem claramente responde "sim"/"confirmo"/"pode mandar"/"manda"/equivalente a ESSA pergunta especificamente.',
  'signal="rejects_pending": resposta negativa clara ("não", "não quero", "deixa assim", "não manda não") a uma pergunta de confirmação pendente.',
  'signal="cancels_pending": a profissional pede explicitamente pra cancelar/desistir de um pedido já em andamento (independente do estado), nunca confundir com rejects_pending (que é especificamente responder "não" à pergunta de confirmação).',
  'signal="status_inquiry": a profissional está perguntando sobre o PROGRESSO/RESULTADO de um pedido que já existe (ex.: "enviou?", "já mandou?", "ela respondeu?", "e aí, foi?", "cadê a resposta?") — nunca confundir com confirms_pending (que é responder sim/não a uma pergunta ainda aberta). Só use quando activeRequest não é null.',
  'Na dúvida genuína entre no_delegation_signal e qualquer outro signal, prefira no_delegation_signal — é sempre mais seguro deixar a mensagem seguir pelo fluxo normal do que reconhecer uma ação de delegação que não foi claramente pedida.',
  'Nunca invente recipientNumber, purposeSummary ou draftMessageContent que não estejam literalmente na mensagem — campo ausente é null, nunca um valor inferido ou parafraseado.',
].join('\n');

export type RecognizeDelegatedContactRequestResult = {
  signal: DelegatedContactSignal;
  recipientName: string | null;
  recipientNumber: string | null;
  purposeSummary: string | null;
  draftMessageContent: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste reconhecedor. Nunca lança —
// falha total vira signal="no_delegation_signal" (fail-closed: nunca
// cria/avança um pedido de delegação sem reconhecimento real).
export async function recognizeDelegatedContactRequest(
  messageText: string,
  activeRequest: ActiveDelegatedContactSummary | null,
  opts: { modelCall?: DelegatedContactRecognizerModelCall; maxRetries?: number } = {}
): Promise<RecognizeDelegatedContactRequestResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? DELEGATED_CONTACT_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText, activeRequest });

  let parsed: DelegatedContactRecognizerModelOutput | null = null;
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
    return { signal: 'no_delegation_signal', recipientName: null, recipientNumber: null, purposeSummary: null, draftMessageContent: null, inputTokens, outputTokens };
  }

  // Guarda estrutural: campos de extração só sobrevivem pros signals
  // onde fazem sentido — nunca confia no model pra "não preencher"
  // sozinho (nunca aceita um draftMessageContent vindo junto de um
  // status_inquiry, por exemplo).
  const keepsExtraction = parsed.signal === 'new_request' || parsed.signal === 'provides_missing_info';
  return {
    signal: parsed.signal,
    recipientName: keepsExtraction ? parsed.recipientName : null,
    recipientNumber: keepsExtraction ? parsed.recipientNumber : null,
    purposeSummary: keepsExtraction ? parsed.purposeSummary : null,
    draftMessageContent: keepsExtraction ? parsed.draftMessageContent : null,
    inputTokens,
    outputTokens,
  };
}
