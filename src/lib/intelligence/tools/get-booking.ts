import { z } from 'zod';

import type { Booking } from '@/lib/supabase/types';
import { registerTool } from '../tool-registry';
import type { ToolContext, ToolDefinition, ToolExecutionOutcome } from '../types';

// READ tool — mesmo padrão de get-opportunity: sempre filtrada por
// artist_profile_id = ctx.representedProfessionalId. found:false pra
// inexistente OU de outro tenant, nunca a distinção entre os dois.

const inputSchema = z.object({ bookingId: z.string().uuid() }).strict();
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    booking: z.object({
      id: z.string(),
      status: z.string(),
      commissionPercent: z.number(),
      cacheAmountCents: z.number().nullable(),
      description: z.string().nullable(),
      eventDate: z.string().nullable(),
      eventLocation: z.string().nullable(),
    }),
  }),
  z.object({ found: z.literal(false) }),
]);
type Output = z.infer<typeof outputSchema>;

async function execute(input: Input, ctx: ToolContext): Promise<ToolExecutionOutcome<Output>> {
  const { supabase } = ctx;

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, commission_percent, cache_amount_cents, description, event_date, event_location')
    .eq('id', input.bookingId)
    .eq('artist_profile_id', ctx.representedProfessionalId)
    .maybeSingle<
      Pick<
        Booking,
        'id' | 'status' | 'commission_percent' | 'cache_amount_cents' | 'description' | 'event_date' | 'event_location'
      >
    >();

  // Mesmo achado do get-opportunity.ts: erro real de consulta nunca
  // vira found:false.
  if (error) {
    return { ok: false, error: 'execution_failed', detail: 'bookings_query_error' };
  }
  if (!booking) {
    return { ok: true, output: { found: false } };
  }

  return {
    ok: true,
    output: {
      found: true,
      booking: {
        id: booking.id,
        status: booking.status,
        commissionPercent: booking.commission_percent,
        cacheAmountCents: booking.cache_amount_cents,
        description: booking.description,
        eventDate: booking.event_date,
        eventLocation: booking.event_location,
      },
    },
  };
}

export const getBookingTool: ToolDefinition<Input, Output> = {
  name: 'get_booking',
  description: 'Lê um booking do profissional representado nesta conversa, por id.',
  inputSchema,
  outputSchema,
  sideEffects: false,
  idempotent: true,
  baseRiskLevel: 'low',
  resolveRisk: () => 'low',
  requiredCapability: 'read_booking',
  retryPolicy: { maxAttempts: 2 },
  timeoutMs: 5000,
  auditFields: ['representedProfessionalId', 'bookingId'],
  execute,
};

registerTool(getBookingTool);
