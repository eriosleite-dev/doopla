import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { getOpenAIClient } from '../openai-client';
import { AI_FEATURE_PREFERENCE_RECOGNITION, PREFERENCE_RECOGNIZER_MAX_RETRIES, PREFERENCE_RECOGNIZER_MODEL } from './config';
import { MAX_MEMORY_VALUE_CHARS, type MemoryKind } from './memory-policy';

// Doopla Intelligence Core v1 — Memória de preferências profissionais
// (ADR 0004, Rodadas 4/5): reconhecedor isolado de preferência
// declarada explicitamente pela profissional, em professional_self.
//
// NUNCA o Classifier, NUNCA o Planner — mesma disciplina de
// delegated-contact/recognizer.ts: um model call pequeno e dedicado,
// schema fechado, nunca decide nada por si só (quem decide se a
// memória nasce de fato é proposeMemory, memory-policy.ts, puro, já
// testado — este módulo só RECONHECE, nunca persiste). Falha total do
// model (timeout/erro/parse inválido) -> SEMPRE recognized=false —
// nunca inventa uma preferência, pior caso é "não reconheceu desta
// vez", nunca "propôs uma memória que a profissional nunca declarou".
//
// Estrutural, nunca uma checagem de runtime que poderia ter um bug: o
// CALLER (wiring futuro, fora desta fundação) só chama este recognizer
// a partir do caminho professional_self — o caminho de conversa com
// cliente simplesmente nunca invoca este módulo. Reforçado aqui, na
// instrução do model, como segunda camada (nunca a única).
//
// "Nível 2" (restrição comercial obrigatória, ex.: "sempre me consulte
// antes de falar de valores com cliente novo") NUNCA é reconhecido
// aqui — ADR 0004 Rodada 5 reclassificou isso como regra aplicada em
// código pelo Post-model Policy Gate, nunca memória lida pelo Planner.
// Este recognizer produz só Nível 1 (communication_style/
// operational_preference/commercial_preference) — contexto que orienta
// tom/estilo do draft, nunca estrutural.

const PREFERENCE_MEMORY_KINDS = ['communication_style', 'operational_preference', 'commercial_preference'] as const satisfies readonly MemoryKind[];
type PreferenceMemoryKind = (typeof PREFERENCE_MEMORY_KINDS)[number];

const modelOutputSchema = z.object({
  recognized: z.boolean(),
  // Só relevantes quando recognized=true — o código nunca confia
  // nestes campos fora disso (recognizePreferenceDeclaration zera o
  // resto abaixo, mesmo padrão de recognizeDelegatedContactRequest).
  kind: z.enum(PREFERENCE_MEMORY_KINDS).nullable(),
  value: z.string().nullable(),
  // Autoavaliação do model (0..1) — preenche ProfessionalMemory.confidence
  // (memory-policy.ts), NUNCA uma autorização: mesmo recognized=true
  // com confidence alta ainda passa por reviewMemory (decisão humana
  // explícita) antes de qualquer uso. Task #72 (fluxo de confirmação)
  // é o primeiro consumidor real deste campo.
  confidence: z.number().min(0).max(1).nullable(),
  // Task #76 (ADR 0012) — rótulo livre curto do ESCOPO a que a
  // preferência se aplica (ex.: "bar", "casamento"), nunca uma
  // taxonomia fechada (diferente do subjectKey de policy-gate-post:
  // lá o espaço de contextos é conhecido/fixo, aqui é aberto). null =
  // regra geral, sem escopo específico (ex.: "sempre faço 2h", sem
  // qualificador). O model só PROPÕE o rótulo — nunca decide o que
  // fazer com ele; quem decide supersede/coexist/ambiguous é só
  // resolveMemorySupersessionCandidate (memory-policy.ts), código
  // puro. Campo OPCIONAL por natureza (null é um valor válido e
  // esperado, nunca "o model não preencheu") — não entra na guarda
  // estrutural de recognized=true abaixo, diferente de kind/value/confidence.
  subjectKey: z.string().nullable(),
});
export type PreferenceRecognizerModelOutput = z.infer<typeof modelOutputSchema>;
export { modelOutputSchema as preferenceRecognizerModelOutputSchema };

export type PreferenceRecognizerModelCallResult = {
  parsed: PreferenceRecognizerModelOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Injetável — mesmo princípio do resto do projeto.
export type PreferenceRecognizerModelCall = (params: { instructions: string; input: string }) => Promise<PreferenceRecognizerModelCallResult>;

async function defaultModelCall({ instructions, input }: { instructions: string; input: string }): Promise<PreferenceRecognizerModelCallResult> {
  const client = getOpenAIClient();
  const response = await client.responses.parse({
    model: PREFERENCE_RECOGNIZER_MODEL,
    instructions,
    input,
    text: { format: zodTextFormat(modelOutputSchema, AI_FEATURE_PREFERENCE_RECOGNITION) },
  });
  return {
    parsed: response.output_parsed ?? null,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
  };
}

const INSTRUCTIONS = [
  'Você reconhece, numa mensagem que uma profissional mandou pra própria Doopla (conversa professional_self, nunca cliente), se ela está DECLARANDO, em primeira pessoa, uma preferência PRÓPRIA sobre como quer ser representada ou como prefere negociar — nunca uma restrição comercial obrigatória (isso é tratado por um mecanismo separado, fora deste reconhecedor) nem uma decisão pontual sobre um caso específico.',
  'Três categorias possíveis, nunca uma quarta: "communication_style" (ex.: "prefiro mensagens mais curtas", "gosto de um tom mais informal"), "operational_preference" (ex.: "não aceito eventos aos domingos", "costumo fechar contratos de 2h"), "commercial_preference" (ex.: "costumo negociar parcelado", "prefiro cachê fixo a porcentagem de bilheteria").',
  'REGRA CRÍTICA, nunca relaxe: só reconheça quando a profissional está declarando algo como SUA PRÓPRIA regra, em primeira pessoa ("eu prefiro...", "sempre faço...", "não aceito...", "costumo..."). NUNCA reconheça quando ela está RELATANDO ou CITANDO um pedido/instrução de um TERCEIRO, mesmo dentro de professional_self — ex.: "o cliente pediu 20% de desconto, pode considerar isso pra próxima vez" é um RELATO do que o cliente disse, nunca uma preferência da própria profissional, mesmo que pareça estar propondo adotar aquilo como prática. Na dúvida real entre declaração própria e relato de terceiro, SEMPRE prefira recognized=false.',
  'Também nunca reconheça uma decisão PONTUAL sobre um caso específico (ex.: "pode aceitar esse desconto pra esse cliente", "deixa eu responder com R$2.000 dessa vez") — isso é uma instrução sobre UM booking/conversa, nunca uma regra geral pro futuro. Só reconheça quando a frase tem cara de regra permanente (presença de palavras como "sempre", "nunca", "costumo", "prefiro", "normalmente", ou equivalente), nunca uma instrução datada/específica.',
  `value: um resumo curto (até ${MAX_MEMORY_VALUE_CHARS} caracteres) da preferência, na própria formulação da profissional quando possível — nunca invente detalhe que ela não disse, nunca expanda além do que foi declarado.`,
  'confidence: de 0 a 1, sua autoavaliação de quão claramente a mensagem expressa uma regra permanente e própria (não uma autorização — só uma estimativa sua). Uma frase explícita com "sempre"/"nunca"/"prefiro" é confidence alta; uma formulação mais implícita é confidence mais baixa, mesmo quando ainda reconhecida.',
  'subjectKey: se a preferência menciona um escopo/contexto específico a que ela se aplica (ex.: tipo de evento como "casamento"/"formatura", tipo de local como "bar"/"casa de show", tipo de cliente como "corporativo"), descreva esse escopo em uma palavra curta, minúscula, sem acento (ex.: "casamento", "bar"). Se a preferência é uma regra GERAL, sem nenhum escopo específico mencionado (ex.: "sempre faço contratos de 2h", sem dizer "em bares" ou qualquer qualificador), subjectKey é null — nunca invente um escopo que a profissional não mencionou.',
  'Na dúvida genuína entre reconhecer ou não, prefira recognized=false — é sempre mais seguro deixar a mensagem seguir pelo fluxo normal do que propor uma memória que a profissional não declarou de verdade como regra sua.',
].join('\n');

export type RecognizePreferenceDeclarationResult = {
  recognized: boolean;
  kind: PreferenceMemoryKind | null;
  value: string | null;
  confidence: number | null;
  subjectKey: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

// Único ponto de chamada ao model deste reconhecedor. Nunca lança —
// falha total vira recognized=false (fail-closed: nunca propõe uma
// memória sem reconhecimento real).
export async function recognizePreferenceDeclaration(
  messageText: string,
  opts: { modelCall?: PreferenceRecognizerModelCall; maxRetries?: number } = {}
): Promise<RecognizePreferenceDeclarationResult> {
  const modelCall = opts.modelCall ?? defaultModelCall;
  const maxRetries = opts.maxRetries ?? PREFERENCE_RECOGNIZER_MAX_RETRIES;
  const input = JSON.stringify({ messageText });

  let parsed: PreferenceRecognizerModelOutput | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await modelCall({ instructions: INSTRUCTIONS, input });
      // Mesmo achado/mesma correção já aplicada no resto do projeto:
      // soma null-safe em vez de sobrescrever, nunca subconta tokens de
      // tentativas anteriores já cobradas pela OpenAI.
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

  if (!parsed || !parsed.recognized) {
    return { recognized: false, kind: null, value: null, confidence: null, subjectKey: null, inputTokens, outputTokens };
  }

  // Guarda estrutural: kind/value/confidence só sobrevivem quando os
  // três vieram preenchidos e kind é um dos 3 válidos — nunca confia
  // no model pra "não preencher" sozinho nem pra um valor vazio.
  // subjectKey NUNCA entra nesta guarda — null é um valor válido e
  // esperado (regra geral, sem escopo), não motivo pra descartar o
  // reconhecimento inteiro.
  const trimmedValue = parsed.value?.trim() ?? '';
  if (!parsed.kind || trimmedValue.length === 0 || parsed.confidence === null) {
    return { recognized: false, kind: null, value: null, confidence: null, subjectKey: null, inputTokens, outputTokens };
  }

  const trimmedSubjectKey = parsed.subjectKey?.trim() ?? '';
  return {
    recognized: true,
    kind: parsed.kind,
    value: trimmedValue,
    confidence: parsed.confidence,
    subjectKey: trimmedSubjectKey.length === 0 ? null : trimmedSubjectKey,
    inputTokens,
    outputTokens,
  };
}
