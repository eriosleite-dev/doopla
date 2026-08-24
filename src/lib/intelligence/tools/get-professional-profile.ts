import { z } from 'zod';

import type { ArtistProfile, Profile } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// READ tool — nunca recebe um professional_id do model. O filtro é
// sempre ctx.representedProfessionalId, resolvido pelo ActorContext,
// nunca um parâmetro do input.
//
// found:false (discriminado, mesmo padrão das outras 3 tools) é
// reservado pra "a query rodou e realmente não achou a linha".
// Qualquer ERRO de fato na consulta (rede, timeout, banco) precisa
// virar ok:false/execution_failed — nunca ser silenciosamente tratado
// como "não encontrado". Achado da auditoria adversarial do Bloco 2:
// checar só `!data` sem olhar `error` conflava as duas coisas.

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    profile: z.object({
      fullName: z.string(),
      stageName: z.string().nullable(),
      category: z.string().nullable(),
      bio: z.string().nullable(),
    }),
  }),
  z.object({ found: z.literal(false) }),
]);
type Output = z.infer<typeof outputSchema>;

async function execute(_input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', ctx.representedProfessionalId)
    .maybeSingle<Pick<Profile, 'full_name'>>();

  if (profileError) {
    // Nunca repassa a mensagem crua do Supabase pra fora deste
    // arquivo — só um código interno sanitizado.
    return { ok: false, error: 'execution_failed', detail: 'profiles_query_error' };
  }
  if (!profile) {
    return { ok: true, output: { found: false } };
  }

  const { data: artistProfile, error: artistError } = await supabase
    .from('artist_profiles')
    .select('stage_name, category, bio')
    .eq('profile_id', ctx.representedProfessionalId)
    .maybeSingle<Pick<ArtistProfile, 'stage_name' | 'category' | 'bio'>>();

  if (artistError) {
    return { ok: false, error: 'execution_failed', detail: 'artist_profiles_query_error' };
  }

  return {
    ok: true,
    output: {
      found: true,
      profile: {
        fullName: profile.full_name,
        stageName: artistProfile?.stage_name ?? null,
        category: artistProfile?.category ?? null,
        bio: artistProfile?.bio ?? null,
      },
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
