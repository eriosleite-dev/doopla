import type { SupabaseClient } from '@supabase/supabase-js';

import type { PendingFollowup, PendingFollowupEvidence, PendingFollowupKind, PendingFollowupStatus } from '../intelligence/concierge/pending-followups';

// Doopla Intelligence Core v1 — ADR 0006 (16/10/2026): wrappers finos
// sobre pending_followups (migration 0120) — persistência pro
// concierge de pendências (intelligence/concierge/pending-followups.ts,
// puro, já testado). Mesmo padrão de professional-memories.ts: nenhuma
// lógica de negócio aqui, só tipar/mapear a chamada RPC.
//
// Fluxo pretendido de uso (wiring real fora desta fundação): chamar
// createPendingFollowup/resolvePendingFollowup/
// closePendingFollowupAsNoResponse/cancelPendingFollowup/
// rescheduleOpenFollowup (pending-followups.ts, puro) primeiro pra
// validar e construir o próximo estado, só então chamar o wrapper
// correspondente aqui pra persistir esse exato resultado.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

type RawRow = {
  id: string;
  professional_id: string;
  booking_id: string | null;
  opportunity_id: string | null;
  kind: PendingFollowupKind;
  responsible_party: PendingFollowup['responsibleParty'];
  evidence: PendingFollowupEvidence;
  promised_return_at: string | null;
  due_at: string;
  status: PendingFollowupStatus;
  created_at: string;
  resolved_at: string | null;
  attempt_count: number;
};

function mapRow(row: RawRow): PendingFollowup {
  return {
    id: row.id,
    professionalId: row.professional_id,
    bookingId: row.booking_id,
    opportunityId: row.opportunity_id,
    kind: row.kind,
    responsibleParty: row.responsible_party,
    evidence: row.evidence,
    promisedReturnAt: row.promised_return_at,
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    attemptCount: row.attempt_count,
  };
}

// Persiste o resultado de createPendingFollowup (TS) — sempre nasce
// status='open', attempt_count=0 (forçado na migration).
export async function persistPendingFollowup(supabase: AnySupabaseClient, followup: PendingFollowup): Promise<PendingFollowup> {
  const { data, error } = await supabase
    .rpc('create_pending_followup', {
      p_id: followup.id,
      p_professional_id: followup.professionalId,
      p_kind: followup.kind,
      p_responsible_party: followup.responsibleParty,
      p_evidence: followup.evidence,
      p_due_at: followup.dueAt,
      p_created_at: followup.createdAt,
      p_booking_id: followup.bookingId,
      p_opportunity_id: followup.opportunityId,
      p_promised_return_at: followup.promisedReturnAt,
    })
    .single();
  if (error || !data) throw new Error(`create_pending_followup falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

type TransitionParams = { id: string; professionalId: string; resolvedAt: string };

async function callTransitionRpc(supabase: AnySupabaseClient, rpcName: string, params: TransitionParams): Promise<PendingFollowup> {
  const { data, error } = await supabase
    .rpc(rpcName, { p_id: params.id, p_professional_id: params.professionalId, p_resolved_at: params.resolvedAt })
    .single();
  if (error || !data) throw new Error(`${rpcName} falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Persiste o resultado de resolvePendingFollowup (TS). Guarda atômica
// de estado (WHERE status='open') vive na migration.
export function persistPendingFollowupResolution(supabase: AnySupabaseClient, params: TransitionParams): Promise<PendingFollowup> {
  return callTransitionRpc(supabase, 'resolve_pending_followup', params);
}

// Persiste o resultado de closePendingFollowupAsNoResponse (TS).
export function persistPendingFollowupClosedAsNoResponse(supabase: AnySupabaseClient, params: TransitionParams): Promise<PendingFollowup> {
  return callTransitionRpc(supabase, 'close_pending_followup_as_no_response', params);
}

// Persiste o resultado de cancelPendingFollowup (TS).
export function persistPendingFollowupCancellation(supabase: AnySupabaseClient, params: TransitionParams): Promise<PendingFollowup> {
  return callTransitionRpc(supabase, 'cancel_pending_followup', params);
}

// Persiste o resultado de rescheduleOpenFollowup (TS) — incrementa
// attempt_count sempre (forçado na migration).
export async function persistPendingFollowupReschedule(supabase: AnySupabaseClient, params: { id: string; professionalId: string; nextDueAt: string }): Promise<PendingFollowup> {
  const { data, error } = await supabase
    .rpc('reschedule_open_pending_followup', { p_id: params.id, p_professional_id: params.professionalId, p_next_due_at: params.nextDueAt })
    .single();
  if (error || !data) throw new Error(`reschedule_open_pending_followup falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Único ponto de leitura pro futuro sweep/cron (wiring fora desta
// fundação). Devolve só pendências 'open' — "vencido"/"estourou
// tentativas" continua só em selectDuePendingFollowups/
// selectFollowupsToCloseAsNoResponse (pending-followups.ts, já
// testados), nunca duplicado aqui.
export async function listOpenPendingFollowups(supabase: AnySupabaseClient, professionalId: string): Promise<PendingFollowup[]> {
  const { data, error } = await supabase.rpc('list_open_pending_followups', { p_professional_id: professionalId });
  if (error) throw new Error(`list_open_pending_followups falhou: ${error.message}`);
  return ((data as RawRow[] | null) ?? []).map(mapRow);
}
