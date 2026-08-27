import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime: monta o structuralFacts que
// buildResolutionContext (Bloco 5) precisa pra ancorar o Approval
// Resolver num fato estrutural real (mesmo shape do golden suite:
// { bookingStatus } / { opportunityStatus }) — nunca inventado, nunca
// vindo do model, sempre uma leitura direta da linha (service_role
// bypassa RLS, mas a leitura é sempre pelo commercial root já
// resolvido pro professionalId desta conversation, nunca um id solto).

export async function buildStructuralFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { bookingId: string | null; opportunityId: string | null }
): Promise<{ structuralFacts: Record<string, unknown>; knownEventDate: string | null }> {
  if (params.bookingId) {
    const { data } = await supabase
      .from('bookings')
      .select('status, event_date')
      .eq('id', params.bookingId)
      .maybeSingle<{ status: string; event_date: string | null }>();
    return data ? { structuralFacts: { bookingStatus: data.status }, knownEventDate: data.event_date } : { structuralFacts: {}, knownEventDate: null };
  }
  if (params.opportunityId) {
    const { data } = await supabase
      .from('opportunities')
      .select('status, event_date')
      .eq('id', params.opportunityId)
      .maybeSingle<{ status: string; event_date: string | null }>();
    return data
      ? { structuralFacts: { opportunityStatus: data.status }, knownEventDate: data.event_date }
      : { structuralFacts: {}, knownEventDate: null };
  }
  return { structuralFacts: {}, knownEventDate: null };
}
