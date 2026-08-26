import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { PROFESSIONAL_DECISION_CATEGORIES } from '../planner/decision-categories';
import { MAX_EXTRACTED_COMMITMENTS, POLICY_GATE_EXTRACTOR_MAX_RETRIES, POLICY_GATE_EXTRACTOR_MODEL } from './config';
import { generateTemporalCandidates, isDatePlausible, resolveTemporalCandidateLabel, type TemporalCandidate, type TemporalContext } from './temporal';
import type { ExtractedCommitment } from './types';

// Doopla Intelligence Core v1 — Post-model Policy Gate: extrator de
// compromisso estruturado.
//
// Contrato (decisão do usuário, autorização desta rodada): o extrator
// NÃO decide allow/block, NÃO interpreta aprovação, NÃO cria
// autoridade — só extrai, do proposedResponse do Planner, quais
// compromissos estruturados (decisionCategory + subjectKey + value, no
// MESMO shape fechado de approval/value-schemas.ts) o texto afirma
// como certos/decididos. O matcher (matcher.ts) é 100% código e é quem
// de fato decide — o extrator só alimenta esse comparador.
//
// Não é um segundo Approval Resolver: nunca seleciona entre candidatos
// já aprovados, nunca reinterpreta "sim"/"pode" do profissional — só
// lê o texto que a PRÓPRIA Doopla está prestes a mandar e relata, de
// forma fechada, o que esse texto está prometendo. Mesma disciplina de
// confiança já usada 3x neste projeto (classifier propõe/código floor;
// planner propõe/código floor; resolver propõe/código valida contra
// candidatos fechados) — não é um paradigma novo.
//
// Roda SEMPRE, independente do que professionalDecisionCategory do
// Planner sinalizou — é uma segunda camada, redundante de propósito
// (defesa em profundidade): se o Planner deixar de marcar uma
// categoria que o texto de fato compromete, o extrator ainda pode
// pegar isso, porque ele lê o texto final diretamente, não confia no
// que o Planner rotulou.

const extractedCommitmentModelSchema = z.object({
  decisionCategory: z.enum(PROFESSIONAL_DECISION_CATEGORIES),
  // Não validado aqui — resolveSubjectKey() (matcher.ts) decide o
  // valor final. O model propõe livre (string ou null); o código nunca
  // aceita esse valor sem checar contra a taxonomia fechada.
  subjectKey: z.string().nullable(),
  // Não validado aqui — validateApprovedValue() (value-schemas.ts,
  // reusado) decide se o shape é aceitável pra decisionCategory.
  value: z.record(z.string(), z.unknown()).nullable(),
  // Closed-candidate-selection temporal (decisão do usuário): só
  // relevante pra decisionCategory='date_change' quando o texto usa
  // uma expressão RELATIVA ("amanhã", "sábado", "dia 20") — o model
  // ecoa o LABEL EXATO de um candidato já listado em temporalCandidates
  // (nunca calcula/inventa uma data). null quando o texto já afirma
  // uma data absoluta completa (nesse caso "value.date" já é
  // suficiente) ou quando não há candidato correspondente com
  // confiança — o código nunca aceita um label que não esteja
  // literalmente na lista fornecida.
  temporalCandidateLabel: z.string().nullable(),
});

const modelOutputSchema = z.object({
  commitments: z.array(extractedCommitmentModelSchema),
});
export type PolicyGateExtractorModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as policyGateExtractorModelOutputSchema };

export type PolicyGateExtractorModelCallResult = {
  parsed: PolicyGateExtractorModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio de resolver.ts/plan.ts/classify.ts.
export type PolicyGateExtractorModelCall = (params: { instructions: string; input: string }) => Promise<PolicyGateExtractorModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<PolicyGateExtractorModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: POLICY_GATE_EXTRACTOR_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, 'policy_gate_extraction') },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

function buildExtractorInstructions(hasTemporalCandidates: boolean): string {
  const base = [
    'Você extrai, de um texto que a Doopla está PRESTES A ENVIAR a um cliente, quais compromissos comerciais estruturados esse texto comunica como certos/decididos — nunca o que ele SUGERE verificar, nunca o que ele pergunta.',
    'Você NUNCA decide se o compromisso é autorizado — só relata o que o texto, lido literalmente e por implicação direta, está confirmando.',
    'Se o texto só coleta informação, pede pra aguardar, diz que vai consultar o profissional, ou não confirma nenhum valor/condição concreta, devolva commitments vazio.',
    'Cada compromisso precisa de um valor CONCRETO no texto (um número, uma data, uma hora, uma descrição específica) — nunca infira um valor que o texto não afirma.',
    'subjectKey só é relevante pra categorias com múltiplas instâncias possíveis no mesmo trabalho (ex.: logistics_commitment pode ser sobre transporte OU hospedagem, separadamente) — descreva em uma palavra curta (ex.: "transport", "lodging") o que o texto especifica; null se a categoria for de instância única (preço, data, hora, duração, local, desconto, condição de pagamento, aceite, cancelamento) ou se o texto não deixar claro qual instância.',
  ];
  const temporal = hasTemporalCandidates
    ? [
        'Para decisionCategory="date_change": se o texto usa uma data JÁ ABSOLUTA e completa (ex.: "20/12/2026"), preencha value.date normalmente (formato YYYY-MM-DD) e deixe temporalCandidateLabel null.',
        'Se o texto usa uma expressão RELATIVA de data (ex.: "amanhã", "sábado", "sábado que vem", "dia 20", "semana que vem"), você NUNCA calcula a data sozinho — em vez disso, escolha o "label" EXATO de um item da lista temporalCandidates (fornecida junto com o texto) que corresponda ao que o texto está dizendo, e devolva esse label em temporalCandidateLabel (deixe value.date null nesse caso).',
        'Se houver mais de uma leitura plausível pra a expressão (ex.: "sábado" podendo ser o próximo sábado OU o seguinte) e o texto ao redor não deixar claro qual, ou se nenhum candidato da lista corresponder com confiança, devolva temporalCandidateLabel null e value null — nunca adivinhe.',
      ]
    : [
        'Nenhum candidato temporal está disponível nesta chamada — se o texto usar uma expressão de data RELATIVA ("amanhã", "sábado", "dia 20"), você não pode resolvê-la: devolva value null e temporalCandidateLabel null pra esse compromisso (nunca invente uma data). Só preencha value.date quando o texto já afirma uma data absoluta completa.',
      ];
  return [...base, ...temporal].join('\n');
}

export type ExtractCommitmentsResult = {
  commitments: ExtractedCommitment[];
  inputTokens: number | null;
  outputTokens: number | null;
  // true quando o model falhou totalmente (timeout/erro/parse
  // inválido em todas as tentativas) — o chamador (gate.ts) trata isso
  // como bloqueio incondicional (extraction_unavailable), nunca como
  // "sem compromissos".
  unavailable: boolean;
};

// Único ponto de chamada ao model deste extrator. Nunca lança — falha
// total vira unavailable=true, tratado como bloqueio pelo chamador
// (fail-closed, nunca "assume que não há compromisso").
//
// temporal é OBRIGATÓRIO no contrato (nunca opcional/implícito) —
// decisão do usuário: referenceTimestamp precisa vir de um dado
// estrutural real (conversation_messages.created_at da mensagem-
// gatilho), nunca de um relógio implícito deste processo.
export async function extractCommitments(
  proposedResponse: string,
  temporal: TemporalContext,
  opts: { modelCall?: PolicyGateExtractorModelCall; maxRetries?: number } = {}
): Promise<ExtractCommitmentsResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? POLICY_GATE_EXTRACTOR_MAX_RETRIES;
  const candidates = generateTemporalCandidates(temporal);
  const instructions = buildExtractorInstructions(candidates.length > 0);
  const input = JSON.stringify({ proposedResponse, temporalCandidates: candidates.map((c) => c.label) });

  let parsed: PolicyGateExtractorModelOutput | null = null;
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
      // Engolido de propósito, mesmo padrão de classify.ts/plan.ts —
      // nunca propaga a mensagem crua do SDK pra fora deste módulo.
    }
  }

  if (!parsed) {
    return { commitments: [], inputTokens, outputTokens, unavailable: true };
  }

  const commitments: ExtractedCommitment[] = parsed.commitments
    .slice(0, MAX_EXTRACTED_COMMITMENTS)
    .map((c) => ({
      decisionCategory: c.decisionCategory,
      rawSubjectKey: c.subjectKey,
      rawValue: resolveDateValue(c, candidates, temporal.referenceTimestamp),
    }));

  return { commitments, inputTokens, outputTokens, unavailable: false };
}

// Resolve o valor final de UM commitment quando a categoria é
// date_change — nunca confia no model pra aritmética de calendário.
// Caminho A (label): o label precisa bater EXATAMENTE com um
// candidato REAL gerado pelo código (generateTemporalCandidates) —
// um label alucinado/fora da lista nunca é aceito, vira null (o
// commitment inteiro fica sem valor, o matcher bloqueia por
// invalid_extracted_value). Caminho B (literal): o texto já afirmava
// uma data absoluta — o valor passa como veio, mas ainda precisa
// sobreviver ao backstop de plausibilidade (nunca só o regex de
// formato). Qualquer outra categoria passa direto, sem alteração.
function resolveDateValue(
  c: { decisionCategory: string; value: Record<string, unknown> | null; temporalCandidateLabel: string | null },
  candidates: readonly TemporalCandidate[],
  referenceTimestamp: string
): Record<string, unknown> | null {
  if (c.decisionCategory !== 'date_change') return c.value;

  if (c.temporalCandidateLabel) {
    const resolvedDate = resolveTemporalCandidateLabel(c.temporalCandidateLabel, candidates);
    if (!resolvedDate || !isDatePlausible(resolvedDate, referenceTimestamp)) return null;
    return { date: resolvedDate };
  }

  const literalDate = typeof c.value?.date === 'string' ? c.value.date : null;
  if (literalDate && !isDatePlausible(literalDate, referenceTimestamp)) return null;
  return c.value;
}
