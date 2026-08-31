import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { MODEL_VALUE_OUTPUT_SCHEMA, modelValueToRecord, validateApprovedValue } from '../approval/value-schemas';
import { PROFESSIONAL_DECISION_CATEGORIES } from '../planner/decision-categories';
import { generateTemporalCandidates, isDatePlausible, resolveTemporalCandidateLabel, type TemporalCandidate, type TemporalContext } from '../policy-gate-post/temporal';
import { INBOUND_PROPOSAL_MAX_RETRIES, INBOUND_PROPOSAL_MODEL, MAX_DETECTED_PROPOSALS } from './config';
import { resolveSubjectKeyForNewProposal } from './subject-key';
import type { DetectedInboundProposal } from './types';

// Doopla Intelligence Core v1 — extrator de proposta inbound.
//
// Diferente de extractCommitments (policy-gate-post/extractor.ts):
// aquele lê o DRAFT da Doopla (nunca enviado ainda) pra decidir se pode
// SAIR; este lê uma MENSAGEM REAL que uma das partes de fato mandou,
// pra decidir se um communicated_proposal_candidate pode ser
// registrado. Nunca a mesma semântica — por isso um model call
// dedicado (decisão do usuário), nunca extractCommitments forçado a
// interpretar pergunta/proposta (seu prompt existe pra REJEITAR
// exatamente isso).
//
// GARANTIA ESTRUTURAL de provenance (não só instrução de prompt): o
// `input` desta chamada é SÓ {messageText, temporalCandidates} — nunca
// histórico de conversa, nunca fatos de contexto, nunca o
// ContextPackage. O model não tem CONTEXTO NENHUM pra inferir um valor
// que a mensagem não afirma — é estruturalmente impossível "completar"
// um valor ausente aqui, não é uma regra que dependa do model obedecer
// uma instrução.
//
// "sim"/"fechado"/"pode" nunca produzem proposta (não têm valor na
// própria mensagem). "Consegue fazer R$2.400?" produz — interrogativo
// conta, desde que o valor esteja literal no texto.

const detectedProposalModelSchema = z.object({
  decisionCategory: z.enum(PROFESSIONAL_DECISION_CATEGORIES),
  // Não validado aqui — resolveSubjectKeyForNewProposal() decide o
  // valor final contra a taxonomia fechada.
  subjectKey: z.string().nullable(),
  // Não validado aqui — validateApprovedValue() (reusado de
  // approval/value-schemas.ts) decide se o shape é aceitável.
  // MODEL_VALUE_OUTPUT_SCHEMA (fronteira Structured Outputs, ver
  // comentário em approval/value-schemas.ts) — nunca z.record(...
  // z.unknown()), que o modo strict da OpenAI rejeita incondicional e
  // silenciosamente (achado real, nunca pego pelos testes anteriores
  // que sempre injetavam modelCall).
  value: MODEL_VALUE_OUTPUT_SCHEMA,
  // Mesmo mecanismo de closed-candidate-selection de policy-gate-post/temporal.ts —
  // reusado, nunca reinventado.
  temporalCandidateLabel: z.string().nullable(),
});

const modelOutputSchema = z.object({
  proposals: z.array(detectedProposalModelSchema),
});
export type InboundProposalModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as inboundProposalModelOutputSchema };

export type InboundProposalModelCallResult = {
  parsed: InboundProposalModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de extractor.ts/resolver.ts/plan.ts/classify.ts.
export type InboundProposalModelCall = (params: { instructions: string; input: string }) => Promise<InboundProposalModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<InboundProposalModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: INBOUND_PROPOSAL_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'inbound_proposal_detection') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

function buildDetectorInstructions(hasTemporalCandidates: boolean): string {
  const base = [
    'Você recebe UMA ÚNICA mensagem real (messageText) que uma das partes de uma negociação comercial de fato enviou — nunca um rascunho, nunca algo que ainda não foi mandado.',
    'Sua tarefa: essa mensagem, lida literalmente, AFIRMA ou PROPÕE um valor/condição concreto pra alguma categoria de decisão comercial? Isso inclui perguntas que já contêm o valor concreto embutido (ex.: "Consegue fazer R$2.400?" propõe price_or_cache=R$2.400) — não é preciso ser uma afirmação categórica.',
    'REGRA ABSOLUTA: o valor/condição precisa estar LITERALMENTE nesta mensagem. Você não recebe nenhum contexto de conversa — não existe nada pra "completar" ou "inferir" além do que está escrito aqui. Se a mensagem não contém um número/data/condição concreto, devolva proposals vazio.',
    'Perguntas SEM valor embutido (ex.: "Qual seu valor?", "Que dia funciona pra você?") nunca produzem proposta — elas pedem um valor, não afirmam um.',
    'Confirmações curtas sem valor restatado (ex.: "sim", "fechado", "pode", "ok", "combinado") NUNCA produzem proposta — mesmo que pareçam confirmar algo, esta mensagem sozinha não contém o valor sendo confirmado.',
    'subjectKey só é relevante pra categorias com múltiplas instâncias possíveis (ex.: logistics_commitment pode ser sobre transporte OU hospedagem) — descreva em uma palavra curta o que a MENSAGEM especifica; null se a categoria for de instância única ou se a mensagem não deixar claro qual instância.',
  ];
  const temporal = hasTemporalCandidates
    ? [
        'Para decisionCategory="date_change": data já absoluta no texto (ex.: "20/12/2026") vai em value.date (YYYY-MM-DD), temporalCandidateLabel null.',
        'Expressão RELATIVA de data (ex.: "sábado", "amanhã") — nunca calcule sozinho: escolha o label EXATO de um item de temporalCandidates que corresponda, devolva em temporalCandidateLabel (value.date null nesse caso). Sem correspondência confiável, os dois ficam null.',
      ]
    : [
        'Nenhum candidato temporal disponível — expressão de data RELATIVA nunca pode ser resolvida aqui: value e temporalCandidateLabel ficam null pra esse item. Só preencha value.date quando a mensagem já afirma uma data absoluta completa.',
      ];
  return [...base, ...temporal].join('\n');
}

export type DetectInboundProposalResult = {
  proposals: DetectedInboundProposal[];
  inputTokens: number | null;
  outputTokens: number | null;
  // true quando o model falhou totalmente — o chamador NUNCA registra
  // candidato nesse caso (fail-closed, mesmo padrão do extrator do
  // Bloco 6: falha de extração nunca vira "sem proposta", vira "não
  // registrado, tente de novo depois").
  unavailable: boolean;
};

// Único ponto de chamada ao model deste módulo. Nunca lança.
export async function detectInboundProposal(
  messageText: string,
  temporal: TemporalContext,
  opts: { modelCall?: InboundProposalModelCall; maxRetries?: number } = {}
): Promise<DetectInboundProposalResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? INBOUND_PROPOSAL_MAX_RETRIES;
  const candidates = generateTemporalCandidates(temporal);
  const instructions = buildDetectorInstructions(candidates.length > 0);
  // Input DELIBERADAMENTE mínimo — só a mensagem e os labels temporais
  // fechados. Nunca histórico, nunca fatos de contexto (ver comentário
  // no topo do arquivo).
  const input = JSON.stringify({ messageText, temporalCandidates: candidates.map((c) => c.label) });

  let parsed: InboundProposalModelOutput | null = null;
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
      // Engolido de propósito, mesmo padrão do resto do projeto.
    }
  }

  if (!parsed) {
    return { proposals: [], inputTokens, outputTokens, unavailable: true };
  }

  const proposals: DetectedInboundProposal[] = [];
  for (const p of parsed.proposals.slice(0, MAX_DETECTED_PROPOSALS)) {
    // p.value chega no shape achatado de MODEL_VALUE_OUTPUT_SCHEMA —
    // reduzido pro Record<string, unknown> | null que resolveDateValue
    // sempre esperou, antes de qualquer outra lógica.
    const valueValidation = validateApprovedValue(
      p.decisionCategory,
      resolveDateValue({ ...p, value: modelValueToRecord(p.value) }, candidates, temporal.referenceTimestamp)
    );
    if (!valueValidation.valid) continue; // fail-closed: forma inválida nunca vira candidato
    const subjectKey = resolveSubjectKeyForNewProposal(p.decisionCategory, p.subjectKey);
    if (subjectKey === null) continue; // fail-closed: sem subject_key provável, sem candidato
    proposals.push({ decisionCategory: p.decisionCategory, rawSubjectKey: subjectKey, rawValue: valueValidation.parsed as Record<string, unknown> | null });
  }

  return { proposals, inputTokens, outputTokens, unavailable: false };
}

// Mesmo raciocínio de resolveDateValue em policy-gate-post/extractor.ts
// — nunca confia no model pra aritmética de calendário.
function resolveDateValue(
  p: { decisionCategory: string; value: Record<string, unknown> | null; temporalCandidateLabel: string | null },
  candidates: readonly TemporalCandidate[],
  referenceTimestamp: string
): Record<string, unknown> | null {
  if (p.decisionCategory !== 'date_change') return p.value;

  if (p.temporalCandidateLabel) {
    const resolvedDate = resolveTemporalCandidateLabel(p.temporalCandidateLabel, candidates);
    if (!resolvedDate || !isDatePlausible(resolvedDate, referenceTimestamp)) return null;
    return { date: resolvedDate };
  }

  const literalDate = typeof p.value?.date === 'string' ? p.value.date : null;
  if (literalDate && !isDatePlausible(literalDate, referenceTimestamp)) return null;
  return p.value;
}
