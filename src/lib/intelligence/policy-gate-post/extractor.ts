import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { PROFESSIONAL_DECISION_CATEGORIES } from '../planner/decision-categories';
import { MAX_EXTRACTED_COMMITMENTS, POLICY_GATE_EXTRACTOR_MAX_RETRIES, POLICY_GATE_EXTRACTOR_MODEL } from './config';
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

function buildExtractorInstructions(): string {
  return [
    'Você extrai, de um texto que a Doopla está PRESTES A ENVIAR a um cliente, quais compromissos comerciais estruturados esse texto comunica como certos/decididos — nunca o que ele SUGERE verificar, nunca o que ele pergunta.',
    'Você NUNCA decide se o compromisso é autorizado — só relata o que o texto, lido literalmente e por implicação direta, está confirmando.',
    'Se o texto só coleta informação, pede pra aguardar, diz que vai consultar o profissional, ou não confirma nenhum valor/condição concreta, devolva commitments vazio.',
    'Cada compromisso precisa de um valor CONCRETO no texto (um número, uma data, uma hora, uma descrição específica) — nunca infira um valor que o texto não afirma.',
    'subjectKey só é relevante pra categorias com múltiplas instâncias possíveis no mesmo trabalho (ex.: logistics_commitment pode ser sobre transporte OU hospedagem, separadamente) — descreva em uma palavra curta (ex.: "transport", "lodging") o que o texto especifica; null se a categoria for de instância única (preço, data, hora, duração, local, desconto, condição de pagamento, aceite, cancelamento) ou se o texto não deixar claro qual instância.',
  ].join('\n');
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
export async function extractCommitments(
  proposedResponse: string,
  opts: { modelCall?: PolicyGateExtractorModelCall; maxRetries?: number } = {}
): Promise<ExtractCommitmentsResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? POLICY_GATE_EXTRACTOR_MAX_RETRIES;
  const instructions = buildExtractorInstructions();

  let parsed: PolicyGateExtractorModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions, input: proposedResponse });
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

  const commitments: ExtractedCommitment[] = parsed.commitments.slice(0, MAX_EXTRACTED_COMMITMENTS).map((c) => ({
    decisionCategory: c.decisionCategory,
    rawSubjectKey: c.subjectKey,
    rawValue: c.value,
  }));

  return { commitments, inputTokens, outputTokens, unavailable: false };
}
