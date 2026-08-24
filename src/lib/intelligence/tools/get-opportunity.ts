import { z } from 'zod';

import type { Opportunity } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// READ tool — sempre filtrada por artist_profile_id =
// ctx.representedProfessionalId, nunca só pelo id recebido. Se a
// oportunidade não existir OU não pertencer ao profissional
// representado, devolve found:false — nunca a linha de outro tenant,
// nunca um erro que revele que ela existe em outro tenant.

const inputSchema = z.object({ opportunityId: z.string().uuid() }).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    opportunity: z.object({
      id: z.string(),
      description: z.string(),
      status: z.string(),
      cacheAmountCents: z.number().nullable(),
      commissionPercent: z.number().nullable(),
      workType: z.string().nullable(),
      category: z.string().nullable(),
      location: z.string().nullable(),
      eventDate: z.string().nullable(),
    }),
  }),
  z.object({ found: z.literal(false) }),
]);
type Output = z.infer<typeof outputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('id, description, status, cache_amount_cents, commission_percent, work_type, category, location, event_date')
    .eq('id', input.opportunityId)
    .eq('artist_profile_id', ctx.representedProfessionalId)
    .maybeSingle<
      Pick<
        Opportunity,
        | 'id'
        | 'description'
        | 'status'
        | 'cache_amount_cents'
        | 'commission_percent'
        | 'work_type'
        | 'category'
        | 'location'
        | 'event_date'
      >
    >();

  if (!opportunity) {
    return { ok: true, output: { found: false } };
  }

  return {
    ok: true,
    output: {
      found: true,
      opportunity: {
        id: opportunity.id,
        description: opportunity.description,
        status: opportunity.status,
        cacheAmountCents: opportunity.cache_amount_cents,
        commissionPercent: opportunity.commission_percent,
        workType: opportunity.work_type,
        category: opportunity.category,
        location: opportunity.location,
        eventDate: opportunity.event_date,
      },
    },
  };
}

export const getOpportunityTool: ToolDefinition<Input, Output> = {
  name: 'get_opportunity',
  description: 'Lê uma oportunidade do profissional representado nesta conversa, por id.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_opportunity',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId', 'opportunityId'],
  execute,
};

registerTool(getOpportunityTool);
