import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import type { Intent } from '../classification';
import type { ActiveDelegatedContactSummary, DelegatedContactSignal } from '../delegated-contact/types';
import type { ResponsePlan } from '../planner';

// Doopla Intelligence Core v1 — AI Evaluation Harness (ADR 0005,
// 16/10/2026): avalia COMPREENSÃO CONVERSACIONAL (Classifier/Planner/
// recognizer de delegação) contra o modelo real, nunca EXECUÇÃO
// OPERACIONAL (nenhum outbound_intent é criado, nenhuma mensagem sai
// pro WhatsApp, nenhum booking muda, nenhuma cobrança acontece — ver
// runner.ts pra a garantia estrutural disso). Um "sinal de delegação
// reconhecido" aqui é sobre a PRECISÃO DO RECONHECEDOR isolado, nunca
// uma confirmação de que algo foi de fato enfileirado/entregue —
// requisito explícito da fundadora (nunca confundir as duas coisas).

export type ScenarioTurn = {
  // Até 21/10/2026, só o profissional falava neste harness (escopo
  // original: professional_self, onde os bugs do diagnóstico inicial
  // aconteceram). Task "Próxima fase: inteligência conversacional
  // multiturno" (21/10/2026) — gap 2 confirmado na auditoria: pra
  // simular uma conversa real com cliente, um turno agora pode vir do
  // profissional OU do participante externo. EXATAMENTE UM dos dois
  // campos abaixo precisa estar presente (nunca os dois, nunca
  // nenhum) — checado em runner.ts, falha fechado com erro explícito
  // se um cenário violar isso. A resposta da Doopla continua sempre
  // GERADA pelo modelo real nesta mesma execução — nunca escrita à
  // mão, nunca copiada de um print antigo.
  professionalMessage?: string;
  // Mensagem do cliente/participante externo neste turno — alternativa
  // a professionalMessage, nunca junto. Quando QUALQUER turno do
  // cenário usa este campo, o conversation_type sintético muda pra
  // 'external_inquiry' e externalParticipant passa a 'loaded' (ver
  // runner.ts) — mesmo efeito que uma conversa real com cliente teria
  // no Context Builder.
  externalParticipantMessage?: string;

  // Assertivas objetivas (requisito 6 da fundadora: critérios
  // objetivos, nunca um segundo model/LLM-judge decidindo "parece
  // bom"). Todas avaliadas em código, contra o resultado real.
  expectedIntentFamily?: Intent[];
  expectedResponsePlanFamily?: ResponsePlan[];
  // Substrings cuja presença no texto final indicam que a Doopla
  // pediu de novo algo já fornecido num turno anterior — detecta
  // "pergunta repetitiva" (Problema 3 do diagnóstico).
  mustNotReask?: string[];
  // Substrings esperadas no texto final — recall correto de um fato/
  // nome/número já dado, ou retomada correta de um assunto anterior.
  mustMentionAny?: string[];
  // Lote P0 96+144 (16/10/2026) — substrings cuja presença na resposta
  // FINAL do Planner indicam uma promessa/afirmação proibida (ex.:
  // capacidade inexistente como "ligação"/"Instagram", ou uma
  // confirmação que os outros campos não sustentam). Generaliza
  // mustNotReask pra qualquer proibição textual, não só repetição de
  // pergunta.
  mustNotContain?: string[];
  // Exige pelo menos uma evidência do tipo conversation_message entre
  // as grounded (já validadas por invariants.ts dentro do próprio
  // planResponse real) — detecta resposta desconectada do histórico/
  // assunto inventado (Problema 1/4 do diagnóstico).
  mustCiteConversationEvidence?: boolean;

  // Só em turnos relacionados a delegação — roda o recognizer isolado
  // (recognizeDelegatedContactRequest, puro, sem I/O) EM PARALELO ao
  // Classifier/Planner, nunca no lugar deles. O estado "ativo" é
  // sempre fornecido pelo PRÓPRIO cenário (hand-authored, sintético) —
  // o harness nunca deriva isso executando a orquestração real
  // (delegated-contact-flow.ts), que grava em banco e está fora de
  // escopo aqui.
  delegation?: {
    activeRequest: ActiveDelegatedContactSummary | null;
    expectedSignal: DelegatedContactSignal;
    // P0.1 (ADR 0005, 16/10/2026) — achado da primeira execução real:
    // o Harness testava só o `signal`, nunca os campos extraídos
    // (recipientName/recipientNumber/purposeSummary/draftMessageContent)
    // — exatamente os campos que decidem o texto que seria de fato
    // preparado pra envio em produção (ver delegated-contact-flow.ts).
    // Substrings cuja presença em draftMessageContent indicam um erro
    // de identidade/conteúdo (ex.: a Doopla se apresentando como a
    // própria destinatária) — checado só quando o campo não é null.
    draftMessageContentMustNotContain?: string[];
  };

  // Identidade/apresentação pessoal (achado da fundadora, 19/10/2026)
  // — verificação AUXILIAR de concisão, nunca a única medida de
  // qualidade (pedido explícito dela: "sem fazer a qualidade depender
  // apenas de quantidade de caracteres"). Teto generoso pra perguntas
  // simples de identidade (1 a 3 frases, não um parágrafo cobrindo
  // toda funcionalidade) — reprova só blocos claramente inchados,
  // nunca penaliza uma resposta de 2-3 frases um pouco mais longa.
  // Sempre complementar à leitura humana (PASS aqui não prova boa
  // representação, só que o texto não ficou gigante).
  maxConciseChars?: number;

  note?: string;
};

export type ConversationScenario = {
  id: string;
  name: string;
  category: string;
  // Rastreabilidade até o caso real que motivou o cenário (print/
  // horário da conversa relatada pela fundadora) — nunca um cenário
  // inventado sem origem documentada nesta rodada inicial.
  source: string;
  // Histórico hand-authored que ANTECEDE o primeiro turno de teste —
  // só pra ancorar um cenário que depende de algo que a PRÓPRIA
  // Doopla já tinha dito antes (ex.: a oferta de tutorial que origina
  // a correção testada). Nunca gerado pelo modelo (é fixo, sintético,
  // documentado como tal) — diferente dos turnos de teste abaixo, cuja
  // resposta da Doopla é sempre real. Omitido quando o cenário começa
  // direto com uma mensagem do profissional.
  seedHistory?: Array<{ authorType: ConversationMessageAuthorType; text: string }>;
  // Lote P0 96+144 (16/10/2026) — fatos sintéticos de booking/
  // oportunidade JÁ CONHECIDOS antes do 1º turno (ex.: cachê já
  // aprovado), necessário pra testar proteção de condição comercial
  // (CMX/PAY/NEG) sem depender de nenhuma orquestração real — mesmo
  // princípio do seedHistory: fixo, sintético, nunca gerado pelo
  // modelo. Chaves batem com os campos reais de
  // context-builder/sections.ts (buildBookingSection/buildOpportunitySection).
  seedBookingFacts?: { status?: string; cacheAmountCents?: number; commissionPercent?: number; description?: string; eventDate?: string; eventLocation?: string };
  seedOpportunityFacts?: { status?: string; cacheAmountCents?: number; commissionPercent?: number; workType?: string; category?: string; location?: string; eventDate?: string; description?: string };
  turns: ScenarioTurn[];
};

// blocking omitido/true: pass=false reprova turnPass/scenarioPass. blocking:
// false (19/10/2026, achado real — ver "nunca usa travessão" em runner.ts):
// o check continua sendo reportado e lido por humano, mas sozinho nunca
// derruba turnPass — reservado pra achado que já tem correção determinística
// garantida a jusante (aqui, stripTravessao, sempre aplicado antes do envio),
// nunca usado pra silenciar um check que afeta o texto que o profissional
// de fato recebe.
export type AssertionCheck = { name: string; pass: boolean; detail?: string; blocking?: boolean };

export type TurnResult = {
  turnIndex: number;
  // Renomeado de professionalMessage (21/10/2026, suporte a turnos de
  // cliente) — o texto que de fato disparou este turno, venha do
  // profissional ou do participante externo; triggerAuthorType diz
  // qual dos dois.
  triggerMessage: string;
  triggerAuthorType: ConversationMessageAuthorType;
  primaryIntent: string;
  classificationStatus: string;
  effectiveConfidence: string;
  responsePlan: string;
  commitmentNature: string;
  // Texto bruto do model (antes de qualquer limpeza determinística) e
  // o texto final (pós stripTravessao) — exatamente a mesma
  // transformação que pipeline.ts aplica antes de qualquer envio real,
  // pra nunca avaliar um texto que o profissional não veria de fato.
  proposedResponseRaw: string | null;
  proposedResponseFinal: string | null;
  evidenceUsed: Array<{ sourceType: string; sourceId: string }>;
  delegationSignal: DelegatedContactSignal | null;
  delegationExpectedSignal: DelegatedContactSignal | null;
  delegationSignalMatches: boolean | null;
  // P0.1 (ADR 0005, 16/10/2026) — campos extraídos pelo recognizer,
  // antes invisíveis no resultado do Harness. São estes campos, não a
  // resposta do Planner, que decidem o texto de fato preparado pra
  // envio em produção (ver delegated-contact-flow.ts, P0.2) — por isso
  // precisam ser lidos por um humano aqui, não só o signal.
  delegationRecipientName: string | null;
  delegationRecipientNumber: string | null;
  delegationPurposeSummary: string | null;
  delegationDraftMessageContent: string | null;
  // true quando este turno passou um activeRequest não-nulo pro
  // reconhecedor (ex.: status='executed', 'sent') — esse estado foi
  // ESCRITO À MÃO no cenário, nunca produzido por uma execução real da
  // orquestração (delegated-contact-flow.ts). Achado da revisão da
  // fundadora (16/10/2026): precisa estar explícito no PRÓPRIO
  // resultado, não só em comentário de código, pra nunca ser lido como
  // prova de continuidade operacional de verdade.
  usesSimulatedOperationalState: boolean;
  assertions: AssertionCheck[];
  formatChecks: AssertionCheck[];
  tokens: {
    classifierInput: number | null;
    classifierOutput: number | null;
    plannerInput: number | null;
    plannerOutput: number | null;
    recognizerInput: number | null;
    recognizerOutput: number | null;
  };
  costCents: number | null;
  latencyMs: { classifier: number; planner: number; recognizer: number | null; total: number };
  turnPass: boolean;
};

export type ScenarioResult = {
  scenarioId: string;
  name: string;
  category: string;
  source: string;
  turns: TurnResult[];
  scenarioPass: boolean;
  totalCostCents: number | null;
  totalLatencyMs: number;
};

// Task "Próxima fase: inteligência conversacional multiturno"
// (21/10/2026) — agregação PURA (zero I/O), extraída de
// runConversationScenario (runner.ts) pra ser reusável tanto lá quanto
// no painel admin: um cenário longo agora roda em vários pedaços
// (runConversationScenarioChunk, chamadas HTTP separadas pra nunca
// estourar o limite de execução da plataforma) e o CLIENTE precisa
// juntar os TurnResult[] de todos os pedaços e calcular o
// ScenarioResult final sem depender de nenhuma função 'use server' —
// mesmo motivo de golden-suite-summary.ts (planner-golden-suite)
// existir fora de actions.ts.
export function buildScenarioResultFromTurns(scenario: { id: string; name: string; category: string; source: string }, turns: TurnResult[]): ScenarioResult {
  const costConfigured = turns.every((t) => t.costCents !== null);
  const totalCostCents = costConfigured ? turns.reduce((sum, t) => sum + (t.costCents ?? 0), 0) : null;
  const totalLatencyMs = turns.reduce((sum, t) => sum + t.latencyMs.total, 0);
  return {
    scenarioId: scenario.id,
    name: scenario.name,
    category: scenario.category,
    source: scenario.source,
    turns,
    scenarioPass: turns.every((t) => t.turnPass),
    totalCostCents,
    totalLatencyMs,
  };
}

export type HarnessRunMetadata = {
  runAt: string;
  gitCommit: string;
  classifierModel: string;
  plannerModel: string;
  recognizerModel: string;
  // Hash (sha256, 12 primeiros chars) do texto literal de cada
  // instruction — pega mudança de prompt mesmo que ninguém lembre de
  // anotar isso manualmente ao comparar duas rodadas (requisito 7 da
  // fundadora: nunca comparar dois resultados sem saber qual versão
  // de código/prompt produziu cada um).
  classifierInstructionsHash: string;
  plannerInstructionsHash: string;
};

// Texto fixo, sempre presente no resultado (nunca só em comentário de
// código ou na UI) — achado da revisão da fundadora (16/10/2026):
// passar nas verificações determinísticas (assertions/formatChecks)
// nunca significa, por si só, que a resposta é semanticamente
// correta/natural/boa. Essas verificações são objetivas e necessárias,
// mas não suficientes — leitura humana do proposedResponseFinal
// continua sendo a única forma real de avaliar qualidade conversacional.
export const SEMANTIC_CORRECTNESS_DISCLAIMER =
  'PASS nas verificações objetivas (assertions/formatChecks) prova só que critérios ESTRUTURAIS específicos foram atendidos (intenção/plano esperado, não repetiu uma pergunta já respondida, citou evidência real, sem travessão, parágrafos presentes). NUNCA prova que a resposta é semanticamente correta, natural ou de boa qualidade — isso exige leitura humana do texto de cada turno.';

export type HarnessRunResult = {
  metadata: HarnessRunMetadata;
  semanticDisclaimer: string;
  scenarios: ScenarioResult[];
  totalCostCents: number | null;
  allPass: boolean;
};

export type { ConversationMessageAuthorType };
