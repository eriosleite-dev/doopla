import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla — eventos de funil do fluxo de qualificação de agências
// (visualização da seção, clique no CTA, início/etapa/abandono/envio
// do formulário, classificação). Wrapper fino sobre
// record_agency_funnel_event (migration 0129) — nunca aceita nome/
// e-mail/IP, só o sessionToken aleatório gerado no cliente.

export const AGENCY_FUNNEL_EVENT_TYPES = [
  'section_view',
  'cta_click',
  'form_start',
  'form_step_completed',
  'form_abandon',
  'form_submit',
  'classified',
] as const;
export type AgencyFunnelEventType = (typeof AGENCY_FUNNEL_EVENT_TYPES)[number];

export async function recordAgencyFunnelEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    eventType: AgencyFunnelEventType;
    sessionToken: string;
    applicationId?: string | null;
    step?: number | null;
    classification?: string | null;
  }
): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('record_agency_funnel_event', {
    p_event_type: params.eventType,
    p_session_token: params.sessionToken,
    p_application_id: params.applicationId ?? null,
    p_step: params.step ?? null,
    p_classification: params.classification ?? null,
  });
  // Best-effort de propósito — analytics nunca deve quebrar o fluxo do
  // usuário nem virar erro visível.
  return { ok: !error };
}
