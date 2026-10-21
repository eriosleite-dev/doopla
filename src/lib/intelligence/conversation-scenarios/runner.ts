import { createHash } from 'crypto';

import { zodTextFormat } from 'openai/helpers/zod';

import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import { estimateAiCostCents } from '@/lib/admin/ai-pricing';
import { stripTravessao } from '@/lib/runtime/message-style';
import { CLASSIFIER_MODEL, buildClassificationInstructions, classifierModelOutputSchema, classifyIntent } from '../classification';
import type { ClassifierModelCall } from '../classification';
import { CONTEXT_MAX_MESSAGES } from '../context-builder';
import type { ContextFact, ContextPackage, MessageContextItem } from '../context-builder';
import { DELEGATED_CONTACT_RECOGNIZER_MODEL, delegatedContactRecognizerModelOutputSchema, recognizeDelegatedContactRequest } from '../delegated-contact';
import type { DelegatedContactRecognizerModelCall } from '../delegated-contact';
import { getOpenAIClient } from '../openai-client';
import { PLANNER_MODEL, buildPlannerInstructions, planResponse, plannerModelOutputSchema } from '../planner';
import type { PlannerModelCall } from '../planner';
import type { MinimalConversation, ToolContext } from '../types';
import { SEMANTIC_CORRECTNESS_DISCLAIMER, buildScenarioResultFromTurns } from './types';
import type { AssertionCheck, ConversationScenario, HarnessRunMetadata, HarnessRunResult, ScenarioResult, ScenarioTurn, TurnResult } from './types';

// Doopla Intelligence Core v1 — AI Evaluation Harness, runner (ADR
// 0005, 16/10/2026).
//
// GARANTIA ESTRUTURAL (requisito 8 da fundadora, nunca só uma
// promessa em comentário): este arquivo não importa, direta ou
// indiretamente, nenhuma função de envio/execução real — nenhum
// sendWhatsapp*, nenhum create_outbound_intent, nenhuma escrita em
// pending_delegated_contacts/bookings/opportunities. Os únicos módulos
// de produção importados são classifyIntent/planResponse/
// recognizeDelegatedContactRequest (Classifier, Planner, recognizer
// isolado — comprovadamente puros quanto a I/O externo, ver cada
// arquivo de origem) e stripTravessao/estimateAiCostCents (funções
// puras de formatação/custo). Um teste de import-graph
// (conversation-scenarios.guard.test.ts) prova isso em CI, não só este
// comentário.
//
// O ToolContext exige um SupabaseClient por contrato de tipo, mas
// classifyIntent/planResponse nunca o chamam de fato (prova estrutural
// já coberta pelos testes de engenharia de cada módulo) — aqui ele
// existe só pra satisfazer o tipo, nunca é usado pra ler/escrever
// nada.

const SYNTHETIC_PROFESSIONAL_ID = 'conversation-scenarios-synthetic-professional';
const SYNTHETIC_PROFESSIONAL_NAME = 'Duda (profissional fictícia do harness)';
// Task "Próxima fase: inteligência conversacional multiturno" (21/10/2026)
// — gap 2 da auditoria: nome sintético fixo pro participante externo,
// mesmo princípio de SYNTHETIC_PROFESSIONAL_NAME (fixo, documentado
// como fictício, nunca um dado real).
const SYNTHETIC_EXTERNAL_PARTICIPANT_ID = 'conversation-scenarios-synthetic-external-participant';
const SYNTHETIC_EXTERNAL_PARTICIPANT_NAME = 'Marina (cliente fictícia do harness)';

function instructionsHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// hasExternalParticipant: true quando QUALQUER turno do cenário usa
// externalParticipantMessage — muda conversation_type pra
// 'external_inquiry', mesmo valor que uma conversa real com cliente
// teria (ver context-builder/classification-context.ts).
function buildSyntheticConversation(hasExternalParticipant: boolean): MinimalConversation {
  return {
    id: 'conversation-scenarios-synthetic',
    represented_professional_id: SYNTHETIC_PROFESSIONAL_ID,
    mandate: 'active',
    status: 'open',
    current_state: 'ongoing',
    conversation_type: hasExternalParticipant ? 'external_inquiry' : 'professional_self',
    external_participant_id: hasExternalParticipant ? SYNTHETIC_EXTERNAL_PARTICIPANT_ID : null,
    related_opportunity_id: null,
    related_booking_id: null,
  };
}

function toMessageItem(authorType: ConversationMessageAuthorType, text: string, index: number): MessageContextItem {
  return {
    messageId: `scenario-msg-${index}`,
    createdAt: new Date(Date.now() + index * 1000).toISOString(),
    authorType,
    direction: authorType === 'professional' ? 'inbound' : 'outbound',
    contentType: 'text',
    text,
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: `scenario-msg-${index}` },
  };
}

// Lote P0 96+144 (16/10/2026) — converte seedBookingFacts/seedOpportunityFacts
// (objeto simples do cenário) em ContextFact[] reais, mesmo shape que
// context-builder/sections.ts produziria a partir do banco. sourceId
// sintético e estável, nunca um id de registro real.
function factsFromSeed(sourceType: 'booking' | 'opportunity', sourceId: string, seed: Record<string, string | number | boolean | undefined> | undefined): ContextFact[] {
  if (!seed) return [];
  const loadedAt = new Date().toISOString();
  const facts: ContextFact[] = [];
  for (const [field, value] of Object.entries(seed)) {
    if (value === undefined) continue;
    facts.push({ sourceType, sourceId, field, value, factType: 'structured', loadedAt });
  }
  return facts;
}

// windowItems: já truncado pelo chamador pro mesmo tamanho de janela
// que produção usa (CONTEXT_MAX_MESSAGES) — este helper nunca trunca
// sozinho, só projeta o que recebe (ver comentário na chamada, no loop
// principal, sobre por que o truncamento precisa acontecer ali).
function buildContextPackage(windowItems: MessageContextItem[], scenario: ConversationScenario, hasExternalParticipant: boolean): ContextPackage {
  const facts: ContextFact[] = [
    { sourceType: 'professional_profile', sourceId: SYNTHETIC_PROFESSIONAL_ID, field: 'fullName', value: SYNTHETIC_PROFESSIONAL_NAME, factType: 'structured', loadedAt: new Date().toISOString() },
  ];
  const bookingFacts = factsFromSeed('booking', 'scenario-seed-booking', scenario.seedBookingFacts);
  const opportunityFacts = factsFromSeed('opportunity', 'scenario-seed-opportunity', scenario.seedOpportunityFacts);
  return {
    conversationId: 'conversation-scenarios-synthetic',
    representedProfessionalId: SYNTHETIC_PROFESSIONAL_ID,
    builtAt: new Date().toISOString(),
    professional: { status: 'loaded', facts },
    professionalBusinessContext: { status: 'not_found' },
    professionalCommercialHistory: { status: 'loaded', facts: [], retrievalStrategy: 'recency_bounded_v1', limit: 5 },
    professionalLearnedPreferences: { status: 'loaded', facts: [] },
    messages: {
      status: 'loaded',
      items: windowItems,
      windowMessageCount: windowItems.length,
      windowSince: windowItems[0]?.createdAt ?? new Date().toISOString(),
    },
    opportunity: opportunityFacts.length > 0 ? { status: 'loaded', facts: opportunityFacts } : { status: 'no_link' },
    booking: bookingFacts.length > 0 ? { status: 'loaded', facts: bookingFacts } : { status: 'no_link' },
    externalParticipant: hasExternalParticipant
      ? {
          status: 'loaded',
          facts: [
            {
              sourceType: 'external_participant',
              sourceId: SYNTHETIC_EXTERNAL_PARTICIPANT_ID,
              field: 'name',
              value: SYNTHETIC_EXTERNAL_PARTICIPANT_NAME,
              factType: 'structured',
              loadedAt: new Date().toISOString(),
            },
          ],
        }
      : { status: 'no_link' },
  };
}

function checkFormat(rawText: string | null, finalText: string | null): AssertionCheck[] {
  if (rawText === null || finalText === null) return [];
  const checks: AssertionCheck[] = [];

  // Checado contra o texto BRUTO, antes da limpeza — checar contra o
  // final seria sempre true (stripTravessao é idempotente), mascarando
  // todo caso real (achado do próprio teste de engenharia deste
  // arquivo, runner.test.ts).
  const hadTravessao = rawText !== stripTravessao(rawText);
  checks.push({
    name: 'nunca usa travessão (—)',
    pass: !hadTravessao,
    detail: hadTravessao ? 'o modelo gerou travessão no texto bruto (a limpeza determinística corrige antes do envio, mas o modelo não deveria precisar dela)' : undefined,
    // Achado real (19/10/2026): este check olha o texto BRUTO, não o
    // que o profissional recebe — stripTravessao é aplicado de forma
    // incondicional a toda proposedResponseFinal (ver linha de montagem
    // do turno abaixo), então um travessão aqui nunca chega ao usuário
    // final, sempre. Não-bloqueante de propósito: continua reportado
    // (sinal de quão bem o model segue a instrução de estilo, útil pra
    // acompanhar ao longo do tempo), mas nunca reprova turnPass/
    // scenarioPass sozinho, pra não afogar sinal real de qualidade de
    // resposta nesse ruído.
    blocking: false,
  });

  // Requisito 10 da fundadora: respostas longas sem nenhuma separação
  // de parágrafo são difíceis de ler no WhatsApp. Limiar conservador
  // (400 chars) — só sinaliza blocos genuinamente grandes, nunca
  // penaliza uma resposta curta de um parágrafo só (comportamento
  // correto pela própria regra de estilo do Planner). Checado contra o
  // texto FINAL — é o que o profissional de fato veria.
  const isLongBlock = finalText.length > 400 && !finalText.includes('\n\n');
  checks.push({
    name: 'resposta longa separa parágrafos quando há mais de um assunto',
    pass: !isLongBlock,
    detail: isLongBlock ? `${finalText.length} caracteres num bloco só, sem nenhuma quebra de parágrafo (\\n\\n)` : undefined,
  });

  return checks;
}

function evaluateAssertions(
  turn: ScenarioTurn,
  finalText: string | null,
  primaryIntent: string,
  responsePlan: string,
  hasConversationEvidence: boolean,
  delegationDraftMessageContent: string | null
): AssertionCheck[] {
  const checks: AssertionCheck[] = [];
  const lowerText = (finalText ?? '').toLowerCase();

  if (turn.expectedIntentFamily) {
    const pass = turn.expectedIntentFamily.includes(primaryIntent as never);
    checks.push({ name: 'intenção dentro do esperado', pass, detail: pass ? undefined : `esperado um de [${turn.expectedIntentFamily.join(', ')}], veio "${primaryIntent}"` });
  }

  if (turn.expectedResponsePlanFamily) {
    const pass = turn.expectedResponsePlanFamily.includes(responsePlan as never);
    checks.push({ name: 'plano de resposta dentro do esperado', pass, detail: pass ? undefined : `esperado um de [${turn.expectedResponsePlanFamily.join(', ')}], veio "${responsePlan}"` });
  }

  if (turn.mustNotReask && turn.mustNotReask.length > 0) {
    const reaskedWith = turn.mustNotReask.find((phrase) => lowerText.includes(phrase.toLowerCase()));
    checks.push({
      name: 'não pergunta de novo informação já fornecida',
      pass: !reaskedWith,
      detail: reaskedWith ? `a resposta contém "${reaskedWith}" — informação que já tinha sido dada num turno anterior` : undefined,
    });
  }

  if (turn.mustMentionAny && turn.mustMentionAny.length > 0) {
    const pass = turn.mustMentionAny.some((phrase) => lowerText.includes(phrase.toLowerCase()));
    checks.push({
      name: 'menciona o fato/assunto esperado',
      pass,
      detail: pass ? undefined : `nenhuma de [${turn.mustMentionAny.join(', ')}] apareceu na resposta — possível perda de contexto ou resposta genérica`,
    });
  }

  if (turn.mustNotContain && turn.mustNotContain.length > 0) {
    const foundWith = turn.mustNotContain.find((phrase) => lowerText.includes(phrase.toLowerCase()));
    checks.push({
      name: 'não promete capacidade/confirmação proibida',
      pass: !foundWith,
      detail: foundWith ? `a resposta contém "${foundWith}" — capacidade inexistente ou confirmação não sustentada pelos outros campos` : undefined,
    });
  }

  // Identidade/apresentação pessoal (achado da fundadora, 19/10/2026)
  // — verificação AUXILIAR, nunca a única medida de qualidade (pedido
  // explícito dela). Só reprova blocos claramente inchados; a leitura
  // humana continua sendo quem avalia tom/naturalidade/adequação de
  // verdade.
  if (turn.maxConciseChars !== undefined && finalText !== null) {
    const pass = finalText.length <= turn.maxConciseChars;
    checks.push({
      name: 'resposta de identidade concisa (verificação auxiliar, nunca prova sozinha de boa representação)',
      pass,
      detail: pass ? undefined : `${finalText.length} caracteres — teto auxiliar de ${turn.maxConciseChars} pra uma pergunta simples de identidade; releia o texto, pode ser uma resposta legitimamente mais longa ou um sinal real de prolixidade`,
    });
  }

  if (turn.mustCiteConversationEvidence) {
    checks.push({
      name: 'resposta ancorada em mensagem real da conversa',
      pass: hasConversationEvidence,
      detail: hasConversationEvidence ? undefined : 'nenhuma evidência do tipo conversation_message citada — risco de resposta desconectada do histórico real',
    });
  }

  // P0.1 (ADR 0005, 16/10/2026) — checa o texto que de fato seria
  // preparado pra envio (draftMessageContent do recognizer), nunca a
  // resposta do Planner (que nunca é isso que o destinatário recebe —
  // ver P0.2). Só avalia quando o campo não é null; null é um
  // resultado VÁLIDO aqui (equivale a "pediu esclarecimento antes de
  // arriscar"), nunca tratado como falha por ausência.
  if (turn.delegation?.draftMessageContentMustNotContain && turn.delegation.draftMessageContentMustNotContain.length > 0 && delegationDraftMessageContent !== null) {
    const lowerDraft = delegationDraftMessageContent.toLowerCase();
    const foundWith = turn.delegation.draftMessageContentMustNotContain.find((phrase) => lowerDraft.includes(phrase.toLowerCase()));
    checks.push({
      name: 'draftMessageContent (texto real preparado pra envio) não comete erro de identidade',
      pass: !foundWith,
      detail: foundWith ? `o texto preparado pra envio contém "${foundWith}" — risco de identidade incorreta (ex.: Doopla se apresentando como a própria destinatária)` : undefined,
    });
  }

  return checks;
}

type RunDeps = {
  toolCtx: ToolContext;
  // Injetáveis — mesmo princípio de dependência explícita do resto do
  // projeto (classify.ts/plan.ts/recognizer.ts). Omitidos, chamam a
  // OpenAI de verdade (uso real do painel admin); injetados, permitem
  // testar a orquestração do harness (crescimento de histórico,
  // avaliação de assertivas, soma de custo/latência) sem rede —
  // usados pelos testes de engenharia deste módulo, nunca pelo painel.
  classifierModelCall?: ClassifierModelCall;
  plannerModelCall?: PlannerModelCall;
  recognizerModelCall?: DelegatedContactRecognizerModelCall;
};

// Captura de erro real (21/10/2026, achado real) — classifyIntent/
// planResponse/recognizeDelegatedContactRequest sempre "engolem" a
// exceção de rede/API de propósito e caem num fallback determinístico
// (comportamento de PRODUÇÃO correto, nunca mudado aqui). Isso deixava
// o harness sem distinguir "a chamada real nunca aconteceu" de "o
// model respondeu algo ruim" — uma rodada real bateu exatamente nisso
// (28 cenários corretos, depois toda chamada seguinte silenciosamente
// caindo em invalid/null, sem nenhum sinal do motivo).
//
// Replica a MESMA chamada real que cada módulo já faz internamente
// (mesmo model, mesmo schema) só pra poder capturar a exceção ANTES
// dela ser engolida — sempre RE-LANÇA depois de capturar, então o
// fallback de classify.ts/plan.ts/recognizer.ts roda exatamente igual
// a antes; isto é só instrumentação, nunca uma segunda implementação
// paralela do caminho real.
function buildRealClassifierModelCallWithErrorCapture(errorBox: { value: string | null }): ClassifierModelCall {
  return async ({ instructions, input }) => {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.parse({
        model: CLASSIFIER_MODEL,
        instructions,
        input,
        text: { format: zodTextFormat(classifierModelOutputSchema, 'intent_classification') },
      });
      return {
        parsed: response.output_parsed ?? null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
    } catch (err) {
      errorBox.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };
}

function buildRealPlannerModelCallWithErrorCapture(errorBox: { value: string | null }): PlannerModelCall {
  return async ({ instructions, input }) => {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.parse({
        model: PLANNER_MODEL,
        instructions,
        input,
        text: { format: zodTextFormat(plannerModelOutputSchema, 'response_plan') },
      });
      return {
        parsed: response.output_parsed ?? null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
    } catch (err) {
      errorBox.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };
}

function buildRealRecognizerModelCallWithErrorCapture(errorBox: { value: string | null }): DelegatedContactRecognizerModelCall {
  return async ({ instructions, input }) => {
    try {
      const client = getOpenAIClient();
      const response = await client.responses.parse({
        model: DELEGATED_CONTACT_RECOGNIZER_MODEL,
        instructions,
        input,
        text: { format: zodTextFormat(delegatedContactRecognizerModelOutputSchema, 'delegated_contact_recognition') },
      });
      return {
        parsed: response.output_parsed ?? null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
    } catch (err) {
      errorBox.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  };
}

// Task "Próxima fase: inteligência conversacional multiturno"
// (21/10/2026) — extraído do corpo do loop original (um turno só) pra
// ser reusável tanto por "roda o cenário inteiro de uma vez"
// (runConversationScenario, engenharia/testes) quanto por "roda um
// pedaço e devolve estado pra continuar depois" (runConversationScenarioChunk,
// usado pelo painel admin pra nunca estourar o limite de execução da
// plataforma num cenário de 10-20 turnos — ver comentário completo em
// runConversationScenarioChunk). Mesma lógica de sempre, zero
// duplicação — `items` recebido já é o histórico ANTES deste turno,
// devolvido já com este turno (gatilho + resposta real) incluído.
async function runSingleTurn(
  scenario: ConversationScenario,
  deps: RunDeps,
  itemsBefore: MessageContextItem[],
  turnIndex: number,
  hasExternalParticipant: boolean
): Promise<{ turnResult: TurnResult; items: MessageContextItem[] }> {
  const items = [...itemsBefore];
  const turn = scenario.turns[turnIndex];
  const hasProfessionalText = turn.professionalMessage !== undefined;
  const hasExternalText = turn.externalParticipantMessage !== undefined;
  if (hasProfessionalText === hasExternalText) {
    // Falha fechado — nunca adivinha autor quando o cenário está mal
    // formado (os dois campos presentes, ou os dois ausentes).
    throw new Error(
      `scenario_turn_author_invalid: turno ${turnIndex} do cenário "${scenario.id}" precisa de EXATAMENTE um entre professionalMessage/externalParticipantMessage`
    );
  }
  const triggerAuthorType: ConversationMessageAuthorType = hasProfessionalText ? 'professional' : 'external_participant';
  const triggerText = (hasProfessionalText ? turn.professionalMessage : turn.externalParticipantMessage) as string;

  // ADR 0010 (20/10/2026) — capturado ANTES do push da mensagem-
  // gatilho deste turno, mesma convenção de recentMessages real
  // (fetchRecentConversationMessages, runtime/recent-conversation-messages.ts):
  // só o que já existia na conversa antes desta mensagem.
  const priorItemsForDelegation = [...items];
  items.push(toMessageItem(triggerAuthorType, triggerText, items.length));

  // Gap 1 da auditoria (21/10/2026): produção nunca envia mais que
  // CONTEXT_MAX_MESSAGES pro Classifier/Planner (context-builder/
  // messages.ts, corte rígido) — até aqui o harness mandava `items`
  // inteiro, sem truncar, então um cenário de 15-20 turnos testava um
  // comportamento que produção nunca teria (mais histórico do que o
  // model real recebe). `items` continua crescendo sem corte (precisa
  // do índice real pra seedHistory/mensagens seguintes) — só a JANELA
  // passada pro Context Package é truncada, espelhando messages.ts.
  const windowItems = items.slice(-CONTEXT_MAX_MESSAGES);

  const conversation = buildSyntheticConversation(hasExternalParticipant);
  const contextPackage = buildContextPackage(windowItems, scenario, hasExternalParticipant);
  const toolCtx: ToolContext = { ...deps.toolCtx, representedProfessionalId: SYNTHETIC_PROFESSIONAL_ID, conversation };

  const classifierErrorBox: { value: string | null } = { value: null };
  const classifierStart = Date.now();
  const { classification, inputTokens: classifierInputTokens, outputTokens: classifierOutputTokens } = await classifyIntent(toolCtx, contextPackage, {
    modelCall: deps.classifierModelCall ?? buildRealClassifierModelCallWithErrorCapture(classifierErrorBox),
  });
  const classifierLatencyMs = Date.now() - classifierStart;

  const plannerErrorBox: { value: string | null } = { value: null };
  const plannerStart = Date.now();
  const { decision, inputTokens: plannerInputTokens, outputTokens: plannerOutputTokens } = await planResponse(toolCtx, contextPackage, classification, {
    modelCall: deps.plannerModelCall ?? buildRealPlannerModelCallWithErrorCapture(plannerErrorBox),
  });
  const plannerLatencyMs = Date.now() - plannerStart;

  let delegationSignal = null as TurnResult['delegationSignal'];
  let recognizerInputTokens: number | null = null;
  let recognizerOutputTokens: number | null = null;
  let recognizerLatencyMs: number | null = null;
  // P0.1/P0.2 (ADR 0005, 16/10/2026) — antes só `signal` era
  // capturado. São estes 4 campos, não a resposta do Planner, que
  // decidem o texto de fato preparado pra envio em produção (ver
  // delegated-contact-flow.ts) — precisam estar no resultado pra
  // leitura humana, não só o sinal isolado.
  let delegationRecipientName: string | null = null;
  let delegationRecipientNumber: string | null = null;
  let delegationPurposeSummary: string | null = null;
  let delegationDraftMessageContent: string | null = null;
  const recognizerErrorBox: { value: string | null } = { value: null };
  if (turn.delegation) {
    // Pedido de delegação só faz sentido vindo do profissional —
    // falha fechado se um cenário tentar combinar com um turno de
    // participante externo (erro de autoria do cenário, nunca
    // silenciosamente ignorado).
    if (!hasProfessionalText) {
      throw new Error(`scenario_turn_delegation_requires_professional: turno ${turnIndex} do cenário "${scenario.id}" tem 'delegation' num turno de participante externo`);
    }
    const recognizerStart = Date.now();
    const result = await recognizeDelegatedContactRequest(triggerText, turn.delegation.activeRequest, {
      modelCall: deps.recognizerModelCall ?? buildRealRecognizerModelCallWithErrorCapture(recognizerErrorBox),
      recentMessages: priorItemsForDelegation.map((m) => ({ authorType: m.authorType, text: m.text })),
    });
    recognizerLatencyMs = Date.now() - recognizerStart;
    delegationSignal = result.signal;
    recognizerInputTokens = result.inputTokens;
    recognizerOutputTokens = result.outputTokens;
    delegationRecipientName = result.recipientName;
    delegationRecipientNumber = result.recipientNumber;
    delegationPurposeSummary = result.purposeSummary;
    delegationDraftMessageContent = result.draftMessageContent;
  }

  const proposedResponseRaw = decision.proposedResponse;
  const proposedResponseFinal = proposedResponseRaw !== null ? stripTravessao(proposedResponseRaw) : null;
  if (proposedResponseFinal !== null) {
    items.push(toMessageItem('ai', proposedResponseFinal, items.length));
  }

  const hasConversationEvidence = decision.evidenceUsed.some((e) => e.sourceType === 'conversation_message');
  const assertions = evaluateAssertions(turn, proposedResponseFinal, classification.primaryIntent, decision.responsePlan, hasConversationEvidence, delegationDraftMessageContent);
  const formatChecks = checkFormat(proposedResponseRaw, proposedResponseFinal);

  const delegationExpectedSignal = turn.delegation?.expectedSignal ?? null;
  const delegationSignalMatches = turn.delegation ? delegationSignal === delegationExpectedSignal : null;

  const classifierCost = estimateAiCostCents({
    model: CLASSIFIER_MODEL,
    usageDate: new Date().toISOString().slice(0, 10),
    inputTokens: classifierInputTokens ?? 0,
    outputTokens: classifierOutputTokens ?? 0,
  });
  const plannerCost = estimateAiCostCents({
    model: PLANNER_MODEL,
    usageDate: new Date().toISOString().slice(0, 10),
    inputTokens: plannerInputTokens ?? 0,
    outputTokens: plannerOutputTokens ?? 0,
  });
  const recognizerCost =
    recognizerInputTokens !== null || recognizerOutputTokens !== null
      ? estimateAiCostCents({
          model: DELEGATED_CONTACT_RECOGNIZER_MODEL,
          usageDate: new Date().toISOString().slice(0, 10),
          inputTokens: recognizerInputTokens ?? 0,
          outputTokens: recognizerOutputTokens ?? 0,
        })
      : null;

  // Agregação (soma de custo/latência, costConfigured) acontece uma vez
  // só, em buildScenarioResultFromTurns (types.ts) — esta função só
  // calcula o custo DESTE turno, nunca acumula estado entre turnos
  // (precisa ser assim pra ser chamável em pedaços separados por
  // runConversationScenarioChunk).
  let turnCostCents: number | null = null;
  if (classifierCost.configured && plannerCost.configured && (recognizerCost === null || recognizerCost.configured)) {
    turnCostCents = classifierCost.costCents + plannerCost.costCents + (recognizerCost && recognizerCost.configured ? recognizerCost.costCents : 0);
  }

  const turnLatencyMs = classifierLatencyMs + plannerLatencyMs + (recognizerLatencyMs ?? 0);

  const allChecks = [...assertions, ...formatChecks].filter((c) => c.blocking !== false);
  const delegationCheckPass = delegationSignalMatches === null || delegationSignalMatches;
  const turnPass = allChecks.every((c) => c.pass) && delegationCheckPass;

  const turnResult: TurnResult = {
    turnIndex,
    triggerMessage: triggerText,
    triggerAuthorType,
    primaryIntent: classification.primaryIntent,
    classificationStatus: classification.classificationStatus,
    effectiveConfidence: classification.effectiveConfidence,
    responsePlan: decision.responsePlan,
    commitmentNature: decision.commitmentNature,
    proposedResponseRaw,
    proposedResponseFinal,
    evidenceUsed: decision.evidenceUsed.map((e) => ({ sourceType: e.sourceType, sourceId: e.sourceId })),
    delegationSignal,
    delegationExpectedSignal,
    delegationSignalMatches,
    delegationRecipientName,
    delegationRecipientNumber,
    delegationPurposeSummary,
    delegationDraftMessageContent,
    usesSimulatedOperationalState: turn.delegation?.activeRequest !== null && turn.delegation?.activeRequest !== undefined,
    assertions,
    formatChecks,
    tokens: {
      classifierInput: classifierInputTokens,
      classifierOutput: classifierOutputTokens,
      plannerInput: plannerInputTokens,
      plannerOutput: plannerOutputTokens,
      recognizerInput: recognizerInputTokens,
      recognizerOutput: recognizerOutputTokens,
    },
    costCents: turnCostCents,
    latencyMs: { classifier: classifierLatencyMs, planner: plannerLatencyMs, recognizer: recognizerLatencyMs, total: turnLatencyMs },
    turnPass,
    classifierError: classifierErrorBox.value,
    plannerError: plannerErrorBox.value,
    recognizerError: recognizerErrorBox.value,
  };

  return { turnResult, items };
}

// Task "Próxima fase: inteligência conversacional multiturno"
// (21/10/2026) — achado real: um cenário de 10-20 turnos sozinho IGNORA
// o lote de 6 turnos do painel admin (chunkScenarioIds nunca quebra um
// cenário ao meio, porque runConversationScenario precisa do histórico
// crescente de todos os turnos de um cenário na mesma execução) —
// rodando 30-45+ chamadas reais sequenciais numa Server Action só,
// exatamente o padrão que já estourou o limite de execução da Vercel
// duas vezes nesta sessão (golden-suite do Planner, e este mesmo
// harness antes do lote de 19/10). Esta função roda só uma FATIA de
// turnos (fromTurnIndex..fromTurnIndex+maxTurnsThisCall-1) e devolve o
// estado (items + nextTurnIndex) pro chamador continuar numa chamada
// seguinte — mesmo princípio de "lista leve + lote retomável" já usado
// em /dev/planner-golden-suite.
//
// priorItems null só na primeiríssima chamada de um cenário (o
// chamador nunca precisa saber montar o seed sozinho — reusa
// exatamente a mesma lógica que runConversationScenario usava antes).
export async function runConversationScenarioChunk(
  scenario: ConversationScenario,
  deps: RunDeps,
  priorItems: MessageContextItem[] | null,
  fromTurnIndex: number,
  maxTurnsThisCall: number
): Promise<{ items: MessageContextItem[]; turnResults: TurnResult[]; nextTurnIndex: number; scenarioComplete: boolean }> {
  if (fromTurnIndex < 0 || fromTurnIndex > scenario.turns.length) {
    throw new Error(`scenario_chunk_invalid_from_turn_index: ${fromTurnIndex} fora do intervalo do cenário "${scenario.id}" (${scenario.turns.length} turnos)`);
  }

  let items = priorItems ?? (scenario.seedHistory ?? []).map((m, i) => toMessageItem(m.authorType, m.text, i));
  const turnResults: TurnResult[] = [];
  // Mesmo critério de antes — computado uma vez por CENÁRIO, nunca por
  // chamada/pedaço (uma conversa real não troca de external_inquiry
  // pra professional_self no meio do caminho, mesmo quando a execução
  // é retomada em várias chamadas).
  const hasExternalParticipant = scenario.turns.some((t) => t.externalParticipantMessage !== undefined);
  const endIndex = Math.min(fromTurnIndex + maxTurnsThisCall, scenario.turns.length);

  for (let turnIndex = fromTurnIndex; turnIndex < endIndex; turnIndex++) {
    const result = await runSingleTurn(scenario, deps, items, turnIndex, hasExternalParticipant);
    items = result.items;
    turnResults.push(result.turnResult);
  }

  return { items, turnResults, nextTurnIndex: endIndex, scenarioComplete: endIndex >= scenario.turns.length };
}

export async function runConversationScenario(scenario: ConversationScenario, deps: RunDeps): Promise<ScenarioResult> {
  const { turnResults } = await runConversationScenarioChunk(scenario, deps, null, 0, scenario.turns.length);
  return buildScenarioResultFromTurns(scenario, turnResults);
}

// Teto defensivo contra execução descontrolada (requisito 4 da
// fundadora: limites de execução/custo, proteção contra abuso). Cada
// turno gasta 2-3 chamadas de modelo; 40 turnos no total já cobre
// várias rodadas de golden-suite confortavelmente sem abrir a porta
// pra uma lista gigante custar sem limite nenhum.
export const CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS = 40;

export async function runConversationScenarios(scenarios: ConversationScenario[], deps: RunDeps): Promise<HarnessRunResult> {
  const totalTurns = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
  if (totalTurns > CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS) {
    throw new Error(`conversation_scenarios_turn_limit_exceeded: ${totalTurns} turnos pedidos, máximo ${CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS} por execução`);
  }

  const scenarioResults: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await runConversationScenario(scenario, deps));
  }

  const costConfigured = scenarioResults.every((s) => s.totalCostCents !== null);
  const totalCostCents = costConfigured ? scenarioResults.reduce((sum, s) => sum + (s.totalCostCents ?? 0), 0) : null;

  return {
    metadata: buildHarnessRunMetadata(),
    semanticDisclaimer: SEMANTIC_CORRECTNESS_DISCLAIMER,
    scenarios: scenarioResults,
    totalCostCents,
    allPass: scenarioResults.every((s) => s.scenarioPass),
  };
}

// Extraído (21/10/2026) — o caminho de cenário longo/retomável
// (runConversationScenarioChunkAction, admin) monta o HarnessRunResult
// final no cliente a partir de vários ScenarioResult separados, mas
// metadata (commit/model/hash de prompt) é a mesma em qualquer caminho
// — nunca duplicada, exportada pra uma Server Action leve buscar sem
// precisar rodar nada.
export function buildHarnessRunMetadata(): HarnessRunMetadata {
  return {
    runAt: new Date().toISOString(),
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev',
    classifierModel: CLASSIFIER_MODEL,
    plannerModel: PLANNER_MODEL,
    recognizerModel: DELEGATED_CONTACT_RECOGNIZER_MODEL,
    classifierInstructionsHash: instructionsHash(buildClassificationInstructions()),
    plannerInstructionsHash: instructionsHash(buildPlannerInstructions()),
  };
}
