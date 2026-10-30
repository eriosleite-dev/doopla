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
// Input deliberadamente pequeno: o texto da mensagem-gatilho + um
// resumo do pedido ativo/recente desta MESMA profissional (nunca
// contexto comercial, nunca dado de outra profissional) — mesmo
// princípio de provenance estrita de detectInboundProposal.
//
// ADR 0010 (20/10/2026) — correção de causa raiz confirmada num
// incidente real: recentMessages (últimas poucas mensagens da
// conversa ATUAL, só author_type+texto) foi adicionado porque sem
// isso o recognizer não tinha como distinguir "?" perguntando sobre
// uma delegação antiga de "?" cobrando uma resposta a uma pergunta
// institucional recente sem resposta — activeRequest sozinho pode vir
// de SEMANAS atrás (get_most_recent_pending_delegated_contact nunca
// filtra por recência, de propósito, pra "enviou?" continuar
// funcionando dias depois), então sem o histórico IMEDIATO o
// recognizer não tinha nenhum jeito de saber se o pedido antigo era
// realmente o assunto da mensagem atual.

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
  'PAPÉIS, sempre os mesmos nesta conversa: quem fala com você agora é a PROFISSIONAL/ARTISTA representada — é ela quem a Doopla representa, é ela a autora do pedido. "Doopla" é quem vai executar o contato em nome dela. A pessoa mencionada pelo nome (ex.: "a Gabi", "o Fulano") é sempre o DESTINATÁRIO — quem vai RECEBER a mensagem, nunca quem a envia e nunca quem fala em primeira pessoa dentro do texto. Isso vale mesmo quando a frase da profissional é ambígua sobre isso (achado real, 16/10/2026: "fala que é a Gabi" já foi mal-interpretado como "assine a mensagem como se você fosse a Gabi" — a Gabi aqui é a destinatária, nunca quem assina).',
  'signal="new_request": a profissional está pedindo, por ela mesma, pra Doopla contatar alguém (ex.: "manda uma mensagem pro Fulano", "quero que você fale com a cliente tal"). Extraia o que estiver literalmente na mensagem: recipientName, recipientNumber (só se o número já veio junto), purposeSummary (um resumo curto do motivo do contato) e draftMessageContent — ver regra de TEXTO LITERAL x INSTRUÇÃO INFORMAL abaixo.',
  'draftMessageContent tem dois modos, nunca confunda os dois: (1) TEXTO LITERAL — a profissional ditou o texto exato, geralmente entre aspas ou claramente palavra por palavra (ex.: manda isso: "Oi, confirma presença?"). Copie EXATAMENTE como está, character a character — nunca reescreva, resuma, parafraseie ou adicione saudação/assinatura que ela não pediu; o texto já autorizado por ela nunca pode ser alterado, nem silenciosamente. (2) INSTRUÇÃO INFORMAL — ela descreveu o que quer comunicar sem ditar o texto exato (ex.: "avisa que vou chegar atrasada", "fala que mandei beijos") — aí sim, componha um texto curto e natural que comunique isso, SEMPRE escrito como vindo da profissional/artista (nunca do destinatário, nunca invertendo quem fala com quem), e NUNCA inventando fato que ela não disse (nome de quem manda, motivo, dado novo). Em qualquer dúvida real sobre qual dos dois modos se aplica, sobre quem a mensagem deveria representar, ou sobre risco de o texto sair com a identidade errada — prefira draftMessageContent=null (equivalente a "ainda não tenho o texto definido") a arriscar um texto errado: é sempre mais seguro, porque o sistema já pergunta o texto exato pra profissional quando draftMessageContent vem null, antes de qualquer envio.',
  'signal="provides_missing_info": só use quando já existe um pedido ativo faltando informação (activeRequest.status indica isso) e esta mensagem fornece exatamente o que faltava (número de telefone, ou o texto a enviar) — nunca um pedido novo. A mesma regra de TEXTO LITERAL x INSTRUÇÃO INFORMAL acima vale aqui pro draftMessageContent.',
  'signal="confirms_pending": só use quando activeRequest.pendingConfirmationText não é null (existe uma pergunta de confirmação pendente) E esta mensagem claramente responde "sim"/"confirmo"/"pode mandar"/"manda"/equivalente a ESSA pergunta especificamente.',
  'signal="rejects_pending": resposta negativa clara ("não", "não quero", "deixa assim", "não manda não") a uma pergunta de confirmação pendente.',
  'signal="cancels_pending": a profissional pede explicitamente pra cancelar/desistir de um pedido já em andamento (independente do estado), nunca confundir com rejects_pending (que é especificamente responder "não" à pergunta de confirmação).',
  'signal="status_inquiry": a profissional está perguntando sobre o PROGRESSO/RESULTADO de um pedido que já existe (ex.: "enviou?", "já mandou?", "ela respondeu?", "e aí, foi?", "cadê a resposta?") — nunca confundir com confirms_pending (que é responder sim/não a uma pergunta ainda aberta). Só use quando activeRequest não é null E (a mensagem ou o histórico recente — recentMessages — mencionam de algum jeito o pedido/destinatário de activeRequest) OU (não há, em recentMessages, nenhuma pergunta sua recente sem resposta que a mensagem atual explique melhor). Achado real (20/10/2026): um "?" isolado, sozinho, NUNCA é o bastante pra status_inquiry quando recentMessages mostra uma pergunta sua recente (ex.: institucional, sobre a própria Doopla) que ainda não foi respondida — nesse caso a leitura mais provável é que "?" está cobrando ESSA pergunta, não o pedido de delegação antigo, mesmo que activeRequest exista. Na dúvida real entre as duas leituras, prefira no_delegation_signal — nunca escolha status_inquiry só porque activeRequest não é null.',
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

// Rede de segurança determinística (achado real, revisão 16/10/2026,
// ADR 0005 P0.1): a instrução acima reduz o risco, mas nunca é
// suficiente sozinha pra uma invariante de segurança — mesmo princípio
// de stripTravessao (código nunca confia só no model pra algo que não
// pode falhar). Nunca deixa draftMessageContent sair com a Doopla se
// apresentando como o PRÓPRIO destinatário (ex.: "aqui é a Gabi", "sou
// a Gabi") — se isso escapar da instrução, força draftMessageContent a
// null, exatamente como se o model tivesse corretamente dito "ainda
// não tenho o texto definido": o fluxo existente (advanceOrAskForMissing,
// delegated-contact-flow.ts) já pergunta o texto exato pra profissional
// nesse caso, sem precisar de nenhum campo/sinal novo.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function draftMessageImpersonatesRecipient(draftMessageContent: string, recipientName: string): boolean {
  const name = recipientName.trim();
  if (!name) return false;
  const escapedName = escapeRegExp(name);
  // Só os padrões de autoapresentação mais inequívocos em português —
  // heurística deliberadamente conservadora (poucos falsos positivos),
  // nunca a única camada de defesa (a instrução acima é a primeira).
  const patterns = [
    new RegExp(`\\baqui\\s+(é|e)\\s+(a|o)?\\s*${escapedName}\\b`, 'i'),
    new RegExp(`\\bsou\\s+(a|o)?\\s*${escapedName}\\b`, 'i'),
    new RegExp(`\\bquem\\s+fala\\s+(é|e)\\s+(a|o)?\\s*${escapedName}\\b`, 'i'),
  ];
  return patterns.some((pattern) => pattern.test(draftMessageContent));
}

// Único ponto de chamada ao model deste reconhecedor. Nunca lança —
// falha total vira signal="no_delegation_signal" (fail-closed: nunca
// cria/avança um pedido de delegação sem reconhecimento real).
export async function recognizeDelegatedContactRequest(
  messageText: string,
  activeRequest: ActiveDelegatedContactSummary | null,
  opts: {
    modelCall?: DelegatedContactRecognizerModelCall;
    maxRetries?: number;
    // ADR 0010 (20/10/2026) — últimas poucas mensagens da conversa
    // ATUAL (mais antiga primeiro), só author_type+texto. Opcional de
    // propósito: nunca obrigatório, nunca derruba quem chama sem isso
    // (compatibilidade com qualquer chamador que ainda não o monte).
    recentMessages?: Array<{ authorType: string; text: string | null }>;
  } = {}
): Promise<RecognizeDelegatedContactRequestResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? DELEGATED_CONTACT_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText, activeRequest, recentMessages: opts.recentMessages ?? [] });

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
  const recipientName = keepsExtraction ? parsed.recipientName : null;
  let draftMessageContent = keepsExtraction ? parsed.draftMessageContent : null;

  // Backstop determinístico (ver comentário acima de
  // draftMessageImpersonatesRecipient): nunca deixa escapar um draft
  // onde a Doopla se apresentaria como a própria destinatária, mesmo
  // que a instrução do prompt falhe. Vira null, nunca lança — mesmo
  // efeito de "ainda não tenho o texto definido".
  if (draftMessageContent && recipientName && draftMessageImpersonatesRecipient(draftMessageContent, recipientName)) {
    draftMessageContent = null;
  }

  return {
    signal: parsed.signal,
    recipientName,
    recipientNumber: keepsExtraction ? parsed.recipientNumber : null,
    purposeSummary: keepsExtraction ? parsed.purposeSummary : null,
    draftMessageContent,
    inputTokens,
    outputTokens,
  };
}
