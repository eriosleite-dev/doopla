import { z } from 'zod';

import type { ArtistProfile, Profile } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// READ tool — nunca recebe um professional_id do model. O filtro é
// sempre ctx.representedProfessionalId, resolvido pelo ActorContext,
// nunca um parâmetro do input.

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  fullName: z.string(),
  stageName: z.string().nullable(),
  category: z.string().nullable(),
  bio: z.string().nullable(),
});
type Output = z.infer<typeof outputSchema>;

async function execute(_input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', ctx.representedProfessionalId)
    .maybeSingle<Pick<Profile, 'full_name'>>();

  if (!profile) {
    return { ok: false, error: 'execution_failed', detail: 'professional_profile_not_found' };
  }

  const { data: artistProfile } = await supabase
    .from('artist_profiles')
    .select('stage_name, category, bio')
    .eq('profile_id', ctx.representedProfessionalId)
    .maybeSingle<Pick<ArtistProfile, 'stage_name' | 'category' | 'bio'>>();

  return {
    ok: true,
    output: {
      fullName: profile.full_name,
      stageName: artistProfile?.stage_name ?? null,
      category: artistProfile?.category ?? null,
      bio: artistProfile?.bio ?? null,
    },
  };
}

export const getProfessionalProfileTool: ToolDefinition<Input, Output> = {
  name: 'get_professional_profile',
  description: 'Lê nome, nome artístico, categoria e bio do profissional representado nesta conversa.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_professional_profile',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId'],
  execute,
};

registerTool(getProfessionalProfileTool);
