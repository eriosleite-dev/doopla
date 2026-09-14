import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { APPROVAL_RESOLVER_MAX_RETRIES, APPROVAL_RESOLVER_MODEL } from './config';
import type { ResolutionContextV1 } from './canonicalize';
import { OPERATION_TYPES, OPERATION_TYPES_REQUIRING_PROVENANCE } from './types';
import type { ApprovalResolverOutput, OperationType, PendingDecision } from './types';
import { MODEL_VALUE_OUTPUT_SCHEMA, modelValueToRecord, PROFESSIONAL_DECISION_CATEGORIES, validateApprovedValue } from './value-schemas';

// Doopla Intelligence Core v1 — Bloco 5: Approval Resolver.
//
// Closed-candidate-selection principle (V2): o model NUNCA referencia
// livremente algo fora do que o código já enumerou em
// ResolutionContext — só pode selecionar entre communicatedProposalCandidates/
// activeApprovalCandidates ou declarar not_a_decision/ambiguous. Isso é
// reforçado pelo próprio shape do schema: communicatedProposalMessageIds
// só aceita IDs, nunca texto livre reconstituindo uma proposta.
//
// O model NUNCA decide sozinho — este módulo só PROPÕE PendingDecision[],
// que o orchestrator então commita via commit_approval_resolution
// (migration 0045), sob toda a disciplina de claim/lease/stale-context
// já validada em Postgres.

const decisionSchema = z.object({
  decisionCategory: z.enum(PROFESSIONAL_DECISION_CATEGORIES),
  subjectKey: z.string(),
  operationType: z.enum(OPERATION_TYPES),
  approvedValue: MODEL_VALUE_OUTPUT_SCHEMA,
  communicatedProposalMessageIds: z.array(z.string()),
  referredValue: MODEL_VALUE_OUTPUT_SCHEMA,
});

const modelOutputSchema = z.object({
  outcome: z.enum(['resolved', 'inconclusive']),
  decisions: z.array(decisionSchema),
  inconclusiveReason: z.enum(['model_ambiguous']).nullable(),
});
export type ApprovalResolverModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as approvalResolverModelOutputSchema };

export type ApprovalResolverModelCallResult = {
  parsed: ApprovalResolverModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de planner/plan.ts e classification/classify.ts.
export type ApprovalResolverModelCall = (params: { instructions: string; input: string }) => Promise<ApprovalResolverModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<ApprovalResolverModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: APPROVAL_RESOLVER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'approval_resolution') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

function buildResolverInstructions(): string {
  return [
    'Você resolve, de forma fechada, se a declaração do profissional confirma, contrapropõe, revoga ou inicia uma decisão comercial.',
    'Você NUNCA pode inventar um candidato — só pode selecionar entre os IDs já listados em communicatedProposalCandidates/activeApprovalCandidates do contexto fornecido.',
    'Se existir um candidato correspondente e inequívoco em communicatedProposalCandidates/activeApprovalCandidates, use esse candidato (contextual_decision/explicit_decision/counterproposal/revocation, conforme o caso).',
    'Se NÃO existir candidato correspondente, mas a própria declaração do profissional expressa uma decisão comercial inequívoca e contém os termos materiais necessários pra representar essa decisão (valor, data, condição — sem depender de informação ausente do contexto fornecido), use operationType=professional_initiated, communicatedProposalMessageIds vazio. Isso vale mesmo quando a frase soa superficialmente como resposta/confirmação, contanto que carregue uma decisão completa e autocontida — exemplos: "Pode fechar por R$3.000.", "Fecha em R$3.000 então.", "Nesse trabalho quero cobrar mais R$300 de deslocamento."',
    'Padrão comum: o cliente PERGUNTA algo (ex.: "quanto custa?", "tem disponibilidade nessa data?") e o profissional responde com um valor/condição concreto e decisivo. Perguntas nunca geram candidato comunicado (só pedem informação, não propõem valor) — então essa pergunta do cliente aparecer no messageWindow logo antes NÃO torna a resposta do profissional menos autocontida. Se não existe candidato correspondente àquela pergunta, a resposta do profissional com valor concreto e decisivo continua professional_initiated, exatamente como se a frase aparecesse isolada — nunca inconclusive só porque existe uma pergunta anterior no histórico. Exemplo: cliente pergunta "quanto custa tocar no meu casamento?"; profissional responde "Pode fechar por R$3.000." — sem candidato correspondente à pergunta, é professional_initiated.',
    'Reserve outcome=inconclusive, inconclusiveReason=model_ambiguous para quando: a mensagem depende de informação não presente no contexto fornecido; o objeto/condição da decisão não pode ser determinado com segurança; há múltiplas interpretações plausíveis; ou a frase apenas menciona/descreve um valor ou condição, sem expressar decisão. Exemplos que NUNCA viram professional_initiated: "R$3.000 é pouco.", "Ele ofereceu R$3.000?", "Normalmente cobro R$3.000.", "Talvez R$3.000.", "Pode usar aquele valor combinado." quando esse referente não estiver disponível no contexto.',
    'Aceites curtos ("sim", "pode", "fechado", "confirmado") continuam dependendo de um referente inequívoco no contexto — nunca viram professional_initiated sozinhos, mesmo sob este critério mais explícito.',
    'Nunca decida "aprovado" por suposição de contexto histórico não representado explicitamente no ResolutionContext fornecido.',
  ].join('\n');
}

// Deriva PendingDecision[] validado a partir da saída fechada do
// model — CHECK simétrico de provenance (mesmo espelhado em SQL via
// cardinality()) validado aqui também, fail-closed se divergir.
//
// closed-candidate-selection principle (V2, reafirmado em toda rodada
// da spec): o model NUNCA pode referenciar uma mensagem que o código
// não enumerou explicitamente. Isso era garantido só pelo texto do
// prompt (buildResolverInstructions) — achado real do Red Team da
// implementação: nada em código impedia o model de "alucinar" um
// communicatedProposalMessageIds fora do ResolutionContext, e essa
// referência forjada seguiria sem erro até commit_approval_resolution.
// Corrigido aqui: todo id em communicatedProposalMessageIds precisa
// pertencer ao universo fechado que o próprio código montou —
// mensagens-fonte de candidatos comunicados OU o messageWindow — nunca
// aceito só por vir do model.
function validateClosedCandidateSelection(context: ResolutionContextV1, decisions: ApprovalResolverModelOutput['decisions']): void {
  const closedMessageIdUniverse = new Set<string>([
    ...context.communicatedProposalCandidates.map((c) => c.sourceMessageId),
    ...context.messageWindow.map((m) => m.messageId),
  ]);
  for (const d of decisions) {
    for (const referencedId of d.communicatedProposalMessageIds) {
      if (!closedMessageIdUniverse.has(referencedId)) {
        throw new Error(
          `closed-candidate-selection violado: o model referenciou messageId="${referencedId}" que não existe em communicatedProposalCandidates nem em messageWindow do ResolutionContext fornecido`
        );
      }
    }
  }
}

function toPendingDecisions(commercialRootId: string, decisions: ApprovalResolverModelOutput['decisions']): PendingDecision[] {
  return decisions.map((d) => {
    const requiresProvenance = OPERATION_TYPES_REQUIRING_PROVENANCE.includes(d.operationType as OperationType);
    const hasProvenance = d.communicatedProposalMessageIds.length > 0;
    if (requiresProvenance !== hasProvenance) {
      throw new Error(
        `decisão inconsistente do resolver: operationType=${d.operationType} exige communicatedProposalMessageIds ${requiresProvenance ? 'não-vazio' : 'vazio'}, veio ${d.communicatedProposalMessageIds.length} ids`
      );
    }
    // d.approvedValue/d.referredValue chegam no shape "achatado" de
    // MODEL_VALUE_OUTPUT_SCHEMA (fronteira do model) — reduzidos aqui
    // pro Record<string, unknown> | null que o resto deste módulo (e
    // PendingDecision) sempre esperou, antes de qualquer outra checagem.
    let approvedValue = modelValueToRecord(d.approvedValue);
    const referredValue = modelValueToRecord(d.referredValue);
    if (d.operationType === 'revocation' && approvedValue !== null) {
      throw new Error('revocation exige approvedValue null');
    }
    // Achado real do Red Team da implementação: nada validava
    // approvedValue contra o value-schema da própria decisionCategory
    // (os 13 shapes de value-schemas.ts nunca eram consultados) — um
    // amountCents ausente/tipo errado ou campo extra passava direto
    // pro commit. Corrigido: todo approvedValue não-nulo precisa
    // validar contra APPROVED_VALUE_SCHEMAS[decisionCategory].
    if (approvedValue !== null) {
      const validation = validateApprovedValue(d.decisionCategory, approvedValue);
      if (!validation.valid) {
        throw new Error(`approvedValue inválido para decisionCategory=${d.decisionCategory}: ${validation.error}`);
      }
      approvedValue = validation.parsed as typeof approvedValue;
    }
    return {
      commercialRootId,
      decisionCategory: d.decisionCategory,
      subjectKey: d.subjectKey,
      operationType: d.operationType as OperationType,
      approvedValue,
      communicatedProposalMessageIds: d.communicatedProposalMessageIds,
      referredValue,
    };
  });
}

export async function resolveApproval(
  context: ResolutionContextV1,
  opts: { modelCall?: ApprovalResolverModelCall; maxRetries?: number } = {}
): Promise<{ output: ApprovalResolverOutput; inputTokens: number | null; outputTokens: number | null }> {
  const instructions = buildResolverInstructions();
  const input = JSON.stringify(context);
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? APPROVAL_RESOLVER_MAX_RETRIES;

  let parsed: ApprovalResolverModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions, input });
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      if (result.parsed) {
        parsed = result.parsed;
        break;
      }
    } catch {
      // Engolido de propósito, mesmo padrão de planner/plan.ts — nunca
      // propaga a mensagem crua do SDK pra fora deste módulo.
    }
  }

  // Falha total do model: fail-closed, nunca "resolved" por default.
  if (!parsed) {
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }

  if (parsed.outcome === 'inconclusive') {
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }

  try {
    validateClosedCandidateSelection(context, parsed.decisions);
    const decisions = toPendingDecisions(context.commercialRootId, parsed.decisions);
    if (decisions.length === 0) {
      // resolved sem nenhuma decisão é uma saída inconsistente do
      // model — fail-closed, nunca commit vazio.
      return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
    }
    return { output: { outcome: 'resolved', decisions }, inputTokens, outputTokens };
  } catch {
    // Validação de provenance falhou: fail-closed, nunca propaga uma
    // decisão fisicamente inconsistente pro commit.
    return { output: { outcome: 'inconclusive', reason: 'model_ambiguous' }, inputTokens, outputTokens };
  }
}
