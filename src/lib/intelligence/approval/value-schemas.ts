import { z } from 'zod';

import { PROFESSIONAL_DECISION_CATEGORIES, type ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — Bloco 5: os 13 shapes de valor por
// decision_category (V2), reaproveitando o enum já existente do
// Bloco 4 (frozen) — nunca redefinido aqui, só importado.
//
// Todo valor monetário/numérico é inteiro (amountCents, não reais
// fracionados) — requisito direto da canonicalização (V3.8, regra 4):
// um número não-inteiro falha a canonicalização, então o schema já
// impede a origem do problema.
export const APPROVED_VALUE_SCHEMAS = {
  accept_or_decline_work: z.object({}).strict(),
  price_or_cache: z.object({ amountCents: z.number().int() }).strict(),
  discount: z.object({ amountCents: z.number().int() }).strict(),
  payment_condition: z
    .object({
      installments: z
        .array(
          z.object({
            percent: z.number().int(),
            timing: z.string(),
            dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          })
        )
        .min(1),
    })
    .strict(),
  date_change: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  time_change: z.object({ time: z.string().regex(/^\d{2}:\d{2}$/) }).strict(),
  duration_change: z.object({ durationMinutes: z.number().int().positive() }).strict(),
  // location é o único campo legitimamente textual (endereço/local),
  // não sujeito a formatação estrita de número/data.
  location_change: z.object({ location: z.string().min(1) }).strict(),
  cancellation: z.object({}).strict(),
  scope_change: z.object({ description: z.string().min(1) }).strict(),
  logistics_commitment: z.object({ description: z.string().min(1) }).strict(),
  contractual_exception: z.object({ description: z.string().min(1) }).strict(),
  other_commitment_change: z.object({ description: z.string().min(1) }).strict(),
} as const satisfies Record<ProfessionalDecisionCategory, z.ZodTypeAny>;

export type ApprovedValueFor<C extends ProfessionalDecisionCategory> = z.infer<(typeof APPROVED_VALUE_SCHEMAS)[C]>;

// Achado real (smoke test do Beta Runtime Integration, primeira vez
// que qualquer chamada real ao model deste projeto usou o transporte
// HTTP/JSON de verdade da OpenAI, nunca exercitado nos testes
// anteriores que sempre injetavam modelCall): o shape antigo usado
// pros campos de "valor" saindo do model (z.record(z.string(),
// z.unknown()).nullable(), em resolver.ts/policy-gate-post/extractor.ts/
// inbound-proposal/detector.ts) não é aceito pelo modo strict de
// Structured Outputs da OpenAI — um objeto sem propriedades fechadas
// não pode ser representado com additionalProperties:false. A própria
// construção do schema (zodTextFormat) lançava, incondicionalmente,
// ANTES de qualquer chamada de rede — nunca dependia de dado/ambiente,
// por isso nunca foi pego por um teste que mockava modelCall.
//
// MODEL_VALUE_OUTPUT_SCHEMA é o substituto: achata as 13 formas de
// APPROVED_VALUE_SCHEMAS acima num único objeto com todo campo
// possível, cada um nullable (formato aceito pelo modo strict — todo
// campo declarado, "opcional" expresso como nullable, nunca omitido).
// modelValueToRecord() reduz a saída do model de volta a um
// Record<string, unknown> | null — exatamente o shape que
// validateApprovedValue()/resolveDateValue() já esperavam nos 3
// chamadores — nenhuma regra de validação muda, só a forma como o
// valor cruza a fronteira do model.
export const MODEL_VALUE_OUTPUT_SCHEMA = z
  .object({
    amountCents: z.number().int().nullable(),
    date: z.string().nullable(),
    time: z.string().nullable(),
    durationMinutes: z.number().int().nullable(),
    location: z.string().nullable(),
    description: z.string().nullable(),
    installments: z
      .array(
        z.object({
          percent: z.number().int(),
          timing: z.string(),
          dueDate: z.string().nullable(),
        })
      )
      .nullable(),
  })
  .nullable();
export type ModelValueOutput = z.infer<typeof MODEL_VALUE_OUTPUT_SCHEMA>;

export function modelValueToRecord(value: ModelValueOutput): Record<string, unknown> | null {
  if (value === null) return null;
  const record: Record<string, unknown> = {};
  if (value.amountCents !== null) record.amountCents = value.amountCents;
  if (value.date !== null) record.date = value.date;
  if (value.time !== null) record.time = value.time;
  if (value.durationMinutes !== null) record.durationMinutes = value.durationMinutes;
  if (value.location !== null) record.location = value.location;
  if (value.description !== null) record.description = value.description;
  if (value.installments !== null) {
    record.installments = value.installments.map((i) => ({
      percent: i.percent,
      timing: i.timing,
      ...(i.dueDate !== null ? { dueDate: i.dueDate } : {}),
    }));
  }
  return record;
}

// Taxonomias fechadas de subject_key por categoria multi-instância —
// nunca texto livre (V2). Categorias inerentemente singulares usam
// 'primary'. other_commitment_change usa um fingerprint determinístico
// de conteúdo (calculado pelo chamador, não aqui) como fallback.
export const SUBJECT_KEY_TAXONOMY: Partial<Record<ProfessionalDecisionCategory, readonly string[]>> = {
  logistics_commitment: ['transport', 'lodging', 'equipment', 'crew_access', 'other'],
  contractual_exception: ['scope', 'parties', 'event', 'payment_terms', 'cancellation_policy', 'other'],
  // Taxonomia menos fundamentada das quatro (herdada da V2, nunca
  // revisada em rodada nenhuma) — documentado como limite residual no
  // relatório final, não uma omissão silenciosa.
  scope_change: ['setlist_repertoire', 'performance_duration', 'guest_count', 'equipment_provided', 'other'],
};

export const SINGULAR_SUBJECT_KEY = 'primary';

export function isMultiInstanceCategory(category: ProfessionalDecisionCategory): boolean {
  return category in SUBJECT_KEY_TAXONOMY || category === 'other_commitment_change';
}

export function validateApprovedValue(category: ProfessionalDecisionCategory, value: unknown): { valid: boolean; parsed?: unknown; error?: string } {
  const schema = APPROVED_VALUE_SCHEMAS[category];
  const result = schema.safeParse(value);
  if (!result.success) {
    return { valid: false, error: result.error.message };
  }
  return { valid: true, parsed: result.data };
}

export { PROFESSIONAL_DECISION_CATEGORIES };
