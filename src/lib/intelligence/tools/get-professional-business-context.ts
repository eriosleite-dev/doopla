import { z } from 'zod';

import type { ArtistProfile } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// Professional Intelligence Context — READ tool que expõe os campos de
// negócio já DECLARADOS pelo profissional (mesmos campos editáveis em
// /dashboard/perfil, migrations 0026/0037/0038) — preferência/dado
// estruturado, nunca autorização (ver contexto-builder/types.ts,
// comentário em ContextFactSourceType). Mesmo padrão das outras 4
// tools: nunca recebe professional_id do model, filtro sempre
// ctx.representedProfessionalId — obrigatório mesmo sob service_role,
// já que RLS não roda no client do Orchestrator (ver
// beta-integration/trigger.ts, createServiceRoleClient()).

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    businessContext: z.object({
      feeRange: z.string().nullable(),
      feeVariesByJobType: z.boolean().nullable(),
      pricingNotes: z.string().nullable(),
      negotiationNotes: z.string().nullable(),
      typicalJobDuration: z.string().nullable(),
      workTypes: z.array(z.string()),
      clientTypes: z.array(z.string()),
      regions: z.array(z.string()),
      travels: z.boolean(),
      acceptsOutOfCityWork: z.boolean(),
      attentionChannel: z.string().nullable(),
      helpAreas: z.array(z.string()),
      careerStage: z.string().nullable(),
      issuesInvoice: z.boolean().nullable(),
    }),
  }),
  z.object({ found: z.literal(false) }),
]);
type Output = z.infer<typeof outputSchema>;

async function execute(_input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: artistProfile, error } = await supabase
    .from('artist_profiles')
    .select(
      'fee_range, fee_varies_by_job_type, pricing_notes, negotiation_notes, typical_job_duration, work_types, client_types, regions, travels, accepts_out_of_city_work, attention_channel, help_areas, career_stage, issues_invoice'
    )
    .eq('profile_id', ctx.representedProfessionalId)
    .maybeSingle<
      Pick<
        ArtistProfile,
        | 'fee_range'
        | 'fee_varies_by_job_type'
        | 'pricing_notes'
        | 'negotiation_notes'
        | 'typical_job_duration'
        | 'work_types'
        | 'client_types'
        | 'regions'
        | 'travels'
        | 'accepts_out_of_city_work'
        | 'attention_channel'
        | 'help_areas'
        | 'career_stage'
        | 'issues_invoice'
      >
    >();

  // Erro real de consulta nunca vira found:false — mesma distinção das
  // outras 4 tools (rede/timeout/banco != "profissional sem
  // artist_profiles ainda").
  if (error) {
    return { ok: false, error: 'execution_failed', detail: 'artist_profiles_query_error' };
  }
  // Profissional sem linha em artist_profiles (ex.: cadastro não
  // concluído) é um estado real, não um erro.
  if (!artistProfile) {
    return { ok: true, output: { found: false } };
  }

  return {
    ok: true,
    output: {
      found: true,
      businessContext: {
        feeRange: artistProfile.fee_range,
        feeVariesByJobType: artistProfile.fee_varies_by_job_type,
        pricingNotes: artistProfile.pricing_notes,
        negotiationNotes: artistProfile.negotiation_notes,
        typicalJobDuration: artistProfile.typical_job_duration,
        workTypes: artistProfile.work_types,
        clientTypes: artistProfile.client_types,
        regions: artistProfile.regions,
        travels: artistProfile.travels,
        acceptsOutOfCityWork: artistProfile.accepts_out_of_city_work,
        attentionChannel: artistProfile.attention_channel,
        helpAreas: artistProfile.help_areas,
        careerStage: artistProfile.career_stage,
        issuesInvoice: artistProfile.issues_invoice,
      },
    },
  };
}

export const getProfessionalBusinessContextTool: ToolDefinition<Input, Output> = {
  name: 'get_professional_business_context',
  description:
    'Lê preferências/dados de negócio já declarados pelo profissional representado (faixa de cachê, notas de precificação/negociação, tipos de trabalho/cliente, região, canal de atenção). Conhecimento declarado, nunca autorização.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_professional_business_context',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId'],
  execute,
};

registerTool(getProfessionalBusinessContextTool);
