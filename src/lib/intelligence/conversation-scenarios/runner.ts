import { createHash } from 'crypto';

import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import { estimateAiCostCents } from '@/lib/admin/ai-pricing';
import { stripTravessao } from '@/lib/runtime/message-style';
import { CLASSIFIER_MODEL, buildClassificationInstructions, classifyIntent } from '../classification';
import type { ClassifierModelCall } from '../classification';
import type { ContextFact, ContextPackage, MessageContextItem } from '../context-builder';
import { DELEGATED_CONTACT_RECOGNIZER_MODEL, recognizeDelegatedContactRequest } from '../delegated-contact';
import type { DelegatedContactRecognizerModelCall } from '../delegated-contact';
import { PLANNER_MODEL, buildPlannerInstructions, planResponse } from '../planner';
import type { PlannerModelCall } from '../planner';
import type { MinimalConversation, ToolContext } from '../types';
import { SEMANTIC_CORRECTNESS_DISCLAIMER } from './types';
import type { AssertionCheck, ConversationScenario, HarnessRunResult, ScenarioResult, ScenarioTurn, TurnResult } from './types';

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

function instructionsHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function buildSyntheticConversation(): MinimalConversation {
  return {
    id: 'conversation-scenarios-synthetic',
    represented_professional_id: SYNTHETIC_PROFESSIONAL_ID,
    mandate: 'active',
    status: 'open',
    current_state: 'ongoing',
    conversation_type: 'professional_self',
    external_participant_id: null,
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

function buildContextPackage(items: MessageContextItem[], scenario: ConversationScenario): ContextPackage {
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
    messages: { status: 'loaded', items, windowMessageCount: items.length, windowSince: items[0]?.createdAt ?? new Date().toISOString() },
    opportunity: opportunityFacts.length > 0 ? { status: 'loaded', facts: opportunityFacts } : { status: 'no_link' },
    booking: bookingFacts.length > 0 ? { status: 'loaded', facts: bookingFacts } : { status: 'no_link' },
    externalParticipant: { status: 'no_link' },
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

export async function runConversationScenario(scenario: ConversationScenario, deps: RunDeps): Promise<ScenarioResult> {
  const items: MessageContextItem[] = (scenario.seedHistory ?? []).map((m, i) => toMessageItem(m.authorType, m.text, i));
  const turnResults: TurnResult[] = [];
  let totalCostCents = 0;
  let costConfigured = true;
  let totalLatencyMs = 0;

  for (let turnIndex = 0; turnIndex < scenario.turns.length; turnIndex++) {
    const turn = scenario.turns[turnIndex];
    // ADR 0010 (20/10/2026) — capturado ANTES do push da mensagem-
    // gatilho deste turno, mesma convenção de recentMessages real
    // (fetchRecentConversationMessages, runtime/recent-conversation-messages.ts):
    // só o que já existia na conversa antes desta mensagem.
    const priorItemsForDelegation = [...items];
    items.push(toMessageItem('professional', turn.professionalMessage, items.length));

    const conversation = buildSyntheticConversation();
    const contextPackage = buildContextPackage(items, scenario);
    const toolCtx: ToolContext = { ...deps.toolCtx, representedProfessionalId: SYNTHETIC_PROFESSIONAL_ID, conversation };

    const classifierStart = Date.now();
    const { classification, inputTokens: classifierInputTokens, outputTokens: classifierOutputTokens } = await classifyIntent(
      toolCtx,
      contextPackage,
      deps.classifierModelCall ? { modelCall: deps.classifierModelCall } : {}
    );
    const classifierLatencyMs = Date.now() - classifierStart;

    const plannerStart = Date.now();
    const { decision, inputTokens: plannerInputTokens, outputTokens: plannerOutputTokens } = await planResponse(
      toolCtx,
      contextPackage,
      classification,
      deps.plannerModelCall ? { modelCall: deps.plannerModelCall } : {}
    );
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
    if (turn.delegation) {
      const recognizerStart = Date.now();
      const result = await recognizeDelegatedContactRequest(turn.professionalMessage, turn.delegation.activeRequest, {
        ...(deps.recognizerModelCall ? { modelCall: deps.recognizerModelCall } : {}),
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

    let turnCostCents: number | null = null;
    if (classifierCost.configured && plannerCost.configured && (recognizerCost === null || recognizerCost.configured)) {
      turnCostCents = classifierCost.costCents + plannerCost.costCents + (recognizerCost && recognizerCost.configured ? recognizerCost.costCents : 0);
      totalCostCents += turnCostCents;
    } else {
      costConfigured = false;
    }

    const turnLatencyMs = classifierLatencyMs + plannerLatencyMs + (recognizerLatencyMs ?? 0);
    totalLatencyMs += turnLatencyMs;

    const allChecks = [...assertions, ...formatChecks].filter((c) => c.blocking !== false);
    const delegationCheckPass = delegationSignalMatches === null || delegationSignalMatches;
    const turnPass = allChecks.every((c) => c.pass) && delegationCheckPass;

    turnResults.push({
      turnIndex,
      professionalMessage: turn.professionalMessage,
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
    });
  }

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    category: scenario.category,
    source: scenario.source,
    turns: turnResults,
    scenarioPass: turnResults.every((t) => t.turnPass),
    totalCostCents: costConfigured ? totalCostCents : null,
    totalLatencyMs,
  };
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
    metadata: {
      runAt: new Date().toISOString(),
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev',
      classifierModel: CLASSIFIER_MODEL,
      plannerModel: PLANNER_MODEL,
      recognizerModel: DELEGATED_CONTACT_RECOGNIZER_MODEL,
      classifierInstructionsHash: instructionsHash(buildClassificationInstructions()),
      plannerInstructionsHash: instructionsHash(buildPlannerInstructions()),
    },
    semanticDisclaimer: SEMANTIC_CORRECTNESS_DISCLAIMER,
    scenarios: scenarioResults,
    totalCostCents,
    allPass: scenarioResults.every((s) => s.scenarioPass),
  };
}
