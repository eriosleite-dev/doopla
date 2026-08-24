import { z } from 'zod';

import type { ExternalParticipant } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// READ tool — nunca recebe um external_participant_id do model/input.
// O id vem sempre de ctx.conversation.external_participant_id (já
// resolvido e autorizado antes desta tool rodar); o filtro de
// isolamento é sempre professional_id = ctx.representedProfessionalId,
// mesmo padrão de get-opportunity/get-booking. Sem input nenhum — nem
// espaço pra um id arbitrário chegar por aqui.

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    participant: z.object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
  }),
  z.object({ found: z.literal(false) }),
]);
type Output = z.infer<typeof outputSchema>;

async function execute(_input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  if (!ctx.conversation.external_participant_id) {
    return { ok: true, output: { found: false } };
  }

  const { data: participant, error } = await supabase
    .from('external_participants')
    .select('id, name, phone, email')
    .eq('id', ctx.conversation.external_participant_id)
    .eq('professional_id', ctx.representedProfessionalId)
    .maybeSingle<Pick<ExternalParticipant, 'id' | 'name' | 'phone' | 'email'>>();

  // Mesmo achado das outras 3 tools: erro real de consulta nunca vira
  // found:false.
  if (error) {
    return { ok: false, error: 'execution_failed', detail: 'external_participants_query_error' };
  }
  if (!participant) {
    return { ok: true, output: { found: false } };
  }

  return {
    ok: true,
    output: {
      found: true,
      participant: {
        id: participant.id,
        name: participant.name,
        phone: participant.phone,
        email: participant.email,
      },
    },
  };
}

export const getExternalParticipantTool: ToolDefinition<Input, Output> = {
  name: 'get_external_participant',
  description: 'Lê a identidade básica do interlocutor externo (cliente) desta conversa, quando existir.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_external_participant',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId'],
  execute,
};

registerTool(getExternalParticipantTool);
