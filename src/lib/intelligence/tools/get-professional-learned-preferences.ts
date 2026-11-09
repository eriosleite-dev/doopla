import { z } from 'zod';

import { selectContextMemories } from '../learning/memory-policy';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';
import { listApprovedProfessionalMemories } from '@/lib/runtime/professional-memories';

// Doopla Intelligence Core v1 — Memória de preferências profissionais
// (ADR 0004, Rodadas 4/5): READ tool que expõe preferências APRENDIDAS
// em conversa (communication_style/operational_preference/
// commercial_preference, já revisadas/aprovadas pela própria
// profissional) — camada DIFERENTE de get_professional_business_context
// (que é dado DIGITADO deliberadamente no painel). Proveniência
// diferente, nunca misturadas na mesma seção (ver ADR 0004 Rodada 4,
// seção 2.4 item 4).
//
// CONHECIMENTO, nunca AUTORIZAÇÃO (mesmo princípio de
// get-professional-business-context.ts e do próprio memory-policy.ts):
// selectContextMemories (puro, já testado) devolve sempre
// contextOnly=true — nenhum compromisso protegido pode se apoiar só
// nisso, só o Context Builder/Planner leem esta tool.
//
// Mesmo padrão das outras tools: nunca recebe professional_id do
// model, filtro sempre ctx.representedProfessionalId.

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  found: z.literal(true),
  preferences: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['communication_style', 'operational_preference', 'commercial_preference', 'client_context']),
      value: z.string(),
      confidence: z.number(),
      contextOnly: z.literal(true),
    })
  ),
});
type Output = z.infer<typeof outputSchema>;

async function execute(_input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  try {
    const memories = await listApprovedProfessionalMemories(ctx.supabase, ctx.representedProfessionalId);
    // selectContextMemories (memory-policy.ts, puro, já testado) faz o
    // trabalho real: isolamento de tenant (revalidado aqui mesmo já
    // filtrado pela RPC — nunca confia só numa camada), dedup por
    // (kind, valor normalizado), expiração, ordenação, limite — nunca
    // duplicado aqui.
    const views = selectContextMemories(memories, { professionalId: ctx.representedProfessionalId });
    return { ok: true, output: { found: true, preferences: views } };
  } catch {
    // Erro real de consulta (rede/banco) — nunca "sem preferências",
    // mesma distinção de execution_failed usada no resto do projeto.
    return { ok: false, error: 'execution_failed', detail: 'professional_memories_query_error' };
  }
}

export const getProfessionalLearnedPreferencesTool: ToolDefinition<Input, Output> = {
  name: 'get_professional_learned_preferences',
  description:
    'Lê preferências de comunicação/operacionais/comerciais que a profissional já declarou e aprovou em conversa (nunca dado digitado no painel, nunca restrição comercial obrigatória). Conhecimento de contexto, nunca autorização.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_professional_learned_preferences',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId'],
  execute,
};

registerTool(getProfessionalLearnedPreferencesTool);
