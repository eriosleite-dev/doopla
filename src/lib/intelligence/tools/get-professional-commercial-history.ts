import { z } from 'zod';

import type { Booking } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// Professional Intelligence Context — READ tool que expõe o histórico
// comercial REAL do próprio profissional (bookings passados), nunca
// agregado/calculado — cada booking é seu próprio fato individual,
// zero "cachê médio"/padrão (isso é Career Intelligence, fora de
// escopo). Filtro sempre ctx.representedProfessionalId, obrigatório
// mesmo sob service_role (RLS não roda no client do Orchestrator).
//
// Diferente das outras tools de propósito: não é resolução de UM
// registro linkado (found:true/false) — é uma LISTA do próprio
// profissional, sempre consultável por ele mesmo, onde lista vazia é
// um estado real ("ainda não tem histórico"), nunca um erro. `limit`
// é sempre fornecido por quem chama (context-builder, nunca o model —
// este Tool Registry não é exposto a function-calling, ver
// tool-registry.ts/sections.ts) — o bound aqui é so defesa em
// profundidade contra um limit malformado, nunca a fonte da verdade do
// budget (isso é CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS, context-builder/
// budget.ts).
//
// Ordenação por created_at (data de criação do registro), não
// event_date — decisão V1 explícita: event_date pode ser nulo (booking
// ainda em proposta) e não teria como desempatar de forma
// determinística sem uma segunda regra. Isto é o retrieval V1
// (recency_bounded_v1, ver context-builder/types.ts) — uma v2 por
// relevância troca só a query/seleção aqui dentro, nunca o contrato de
// saída.

const inputSchema = z.object({ limit: z.number().int().min(1).max(20) }).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  bookings: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      cacheAmountCents: z.number().nullable(),
      commissionPercent: z.number(),
      eventDate: z.string().nullable(),
      eventLocation: z.string().nullable(),
      description: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
});
type Output = z.infer<typeof outputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, status, cache_amount_cents, commission_percent, event_date, event_location, description, created_at')
    .eq('artist_profile_id', ctx.representedProfessionalId)
    // Tiebreaker por `id` além de `created_at`, mesmo raciocínio de
    // context-builder/messages.ts: sem uma segunda chave, o corte do
    // `.limit()` não seria determinístico entre execuções.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(input.limit)
    .returns<
      Pick<Booking, 'id' | 'status' | 'cache_amount_cents' | 'commission_percent' | 'event_date' | 'event_location' | 'description' | 'created_at'>[]
    >();

  if (error) {
    return { ok: false, error: 'execution_failed', detail: 'bookings_query_error' };
  }

  return {
    ok: true,
    output: {
      bookings: (bookings ?? []).map((booking) => ({
        id: booking.id,
        status: booking.status,
        cacheAmountCents: booking.cache_amount_cents,
        commissionPercent: booking.commission_percent,
        eventDate: booking.event_date,
        eventLocation: booking.event_location,
        description: booking.description,
        createdAt: booking.created_at,
      })),
    },
  };
}

export const getProfessionalCommercialHistoryTool: ToolDefinition<Input, Output> = {
  name: 'get_professional_commercial_history',
  description:
    'Lê os bookings mais recentes do próprio profissional representado (retrieval V1 por recência, bounded) — histórico real, individual, nunca agregado ou calculado.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_professional_commercial_history',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId', 'limit'],
  execute,
};

registerTool(getProfessionalCommercialHistoryTool);
