import type { SupabaseClient } from '@supabase/supabase-js';

import { computeContextIdentity } from './canonicalize';
import { buildResolutionContext } from './resolution-context';
import { resolveApproval, type ApprovalResolverModelCall } from './resolver';
import type { CommitResolutionResult } from './types';

// Doopla Intelligence Core v1 — Bloco 5: orquestração do Approval
// Engine. Único ponto que encadeia as três transações curtas
// especificadas na spec — nunca segura uma transação Postgres aberta
// durante a chamada externa ao resolver:
//
//   Transação A (try_acquire_approval_resolution_claim) — só posse +
//   backoff, NUNCA gasta rate limiter (achado do teste de concorrência
//   desta implementação, ver relatório).
//     |
//   [fora de transação] build ResolutionContext (F1) — determinístico,
//   sem chamada externa.
//     |
//   Transação B (reserve_approval_dispatch_token) — débito do rate
//   limiter, revalida lease no mesmo instante do débito.
//     |
//   [fora de transação] chamada externa ao resolver (OpenAI).
//     |
//   [fora de transação] recompute ResolutionContext (F2).
//     |
//   Transação #2 (commit_approval_resolution) — revalida lease, revalida
//   terminal, compara F1 x F2 (descarta se stale), escreve.
//
// Se qualquer etapa negar, a function retorna sem nunca ter chamado o
// resolver desnecessariamente, e libera o claim explicitamente quando
// aplicável (release_approval_resolution_claim) — nunca deixa presa
// até o lease expirar por um motivo que não é de posse.
//
// Micro-patch (achado real do smoke test do Beta Runtime Integration,
// contra @supabase/supabase-js de verdade — nunca exercitado antes
// contra um client HTTP/JSON real, só contra o driver `pg` binário em
// testes anteriores): computeContextIdentity() devolve um Buffer do
// Node — passar esse Buffer direto como parâmetro bytea numa RPC via
// supabase-js falha (JSON.stringify de um Buffer vira
// {"type":"Buffer","data":[...]}, nunca um bytea válido; a RPC recusa
// fail-closed com invalid_context_identity, octet_length ≠ 32). Fix
// isolado nesta fronteira — nunca muda o que computeContextIdentity()
// devolve nem como F1/F2 são comparados internamente, só como o valor
// cruza pra uma chamada RPC.
function contextIdentityToBytea(identity: Buffer): string {
  return `\\x${identity.toString('hex')}`;
}

export type RunApprovalEngineResult =
  | { status: 'not_eligible'; reason: string }
  | { status: 'budget_exceeded'; reason: 'context_budget_exceeded' | 'chain_candidate_overflow' }
  | { status: 'stale_context_discarded' }
  | { status: 'committed'; outcome: 'resolved' | 'inconclusive'; approvalResolutionId: string | null; approvalRecordIds: string[] };

export async function runApprovalEngine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: {
    professionalId: string;
    conversationId: string;
    professionalStatementMessageId: string;
    bookingId: string | null;
    opportunityId: string | null;
    structuralFacts: Record<string, unknown>;
    workerId: string;
    modelCall?: ApprovalResolverModelCall;
  }
): Promise<RunApprovalEngineResult> {
  // Checa backoff (inclusive overflow, migration 0047) ANTES de montar
  // F1 — nunca reconstrói ResolutionContext à toa numa mensagem
  // cronicamente over-budget/over-limit: o mesmo next_eligible_at que
  // já governa retry de resolução normal (try_acquire_approval_resolution_claim)
  // agora também é escrito por record_resolution_overflow, então
  // respeitá-lo aqui fecha o ciclo attempts/backoff pros dois casos.
  const { data: backoffRows, error: backoffError } = await supabase.rpc('get_resolution_backoff_status', {
    p_message_id: params.professionalStatementMessageId,
  });
  if (backoffError) throw new Error(`get_resolution_backoff_status falhou: ${backoffError.message}`);
  const backoffStatus = (Array.isArray(backoffRows) ? backoffRows[0] : backoffRows) as {
    next_eligible_at: string | null;
    last_overflow_reason: string | null;
    last_overflow_at: string | null;
    attempt_count: number | null;
  } | null;
  if (backoffStatus?.next_eligible_at && new Date(backoffStatus.next_eligible_at).getTime() > Date.now()) {
    return { status: 'not_eligible', reason: 'backoff' };
  }

  // F1: contexto ANTES de qualquer chamada externa — determinístico,
  // sem I/O de rede, calculável mesmo antes de saber se o claim será
  // concedido (por isso a checagem de budget já pode ocorrer aqui,
  // sem gastar claim/token à toa se o contexto já estiver óbvio demais).
  const contextResultF1 = await buildResolutionContext(supabase, {
    professionalId: params.professionalId,
    conversationId: params.conversationId,
    professionalStatementMessageId: params.professionalStatementMessageId,
    bookingId: params.bookingId,
    opportunityId: params.opportunityId,
    structuralFacts: params.structuralFacts,
  });

  if (contextResultF1.budgetExceeded) {
    // Decisão do usuário (fechamento do Bloco 5, migration 0047):
    // overflow é condição OPERACIONAL do resolver, nunca um outcome
    // comercial — nunca pinado em approval_resolutions (que exige
    // context_identity real de 32 bytes, por definição irrepresentável
    // aqui). Registrado em approval_resolution_backoff via
    // record_resolution_overflow, tratado como tentativa que não
    // progrediu (mesmo backoff exponencial de uma resolução comum) —
    // fecha o ciclo que get_resolution_backoff_status consulta acima
    // antes de reconstruir contexto de novo.
    const { error: overflowError } = await supabase.rpc('record_resolution_overflow', {
      p_message_id: params.professionalStatementMessageId,
      p_commercial_root_id: contextResultF1.commercialRootId,
      p_reason: contextResultF1.reason,
      p_decision_category: contextResultF1.decisionCategory ?? null,
      p_subject_key: contextResultF1.subjectKey ?? null,
      p_magnitude: contextResultF1.magnitude ?? null,
    });
    if (overflowError) throw new Error(`record_resolution_overflow falhou: ${overflowError.message}`);
    return { status: 'budget_exceeded', reason: contextResultF1.reason };
  }

  const contextF1 = contextResultF1.context;
  const f1 = computeContextIdentity(contextF1);

  const { data: acquireRows, error: acquireError } = await supabase.rpc('try_acquire_approval_resolution_claim', {
    p_message_id: params.professionalStatementMessageId,
    p_worker_id: params.workerId,
    p_current_context_identity: contextIdentityToBytea(f1),
  });
  if (acquireError) throw new Error(`try_acquire_approval_resolution_claim falhou: ${acquireError.message}`);
  const acquire = (Array.isArray(acquireRows) ? acquireRows[0] : acquireRows) as {
    granted: boolean;
    lease_token: string | null;
    deny_reason: string | null;
  };

  if (!acquire.granted || !acquire.lease_token) {
    return { status: 'not_eligible', reason: acquire.deny_reason ?? 'unknown' };
  }
  const leaseToken = acquire.lease_token;

  const { data: reserveRows, error: reserveError } = await supabase.rpc('reserve_approval_dispatch_token', {
    p_message_id: params.professionalStatementMessageId,
    p_lease_token: leaseToken,
  });
  if (reserveError) throw new Error(`reserve_approval_dispatch_token falhou: ${reserveError.message}`);
  const reserve = (Array.isArray(reserveRows) ? reserveRows[0] : reserveRows) as { reserved: boolean; deny_reason: string | null };

  if (!reserve.reserved) {
    // Rate limitado (ou lease já invalidado entre acquire e reserve):
    // libera o claim explicitamente, nunca deixa preso até expirar.
    await supabase.rpc('release_approval_resolution_claim', { p_message_id: params.professionalStatementMessageId, p_lease_token: leaseToken });
    return { status: 'not_eligible', reason: reserve.deny_reason ?? 'unknown' };
  }

  // Só agora, com token reservado e lease revalidado, a chamada
  // externa acontece — fora de qualquer transação Postgres.
  const { output } = await resolveApproval(contextF1, { modelCall: params.modelCall });

  // F2: recomputa o contexto imediatamente antes do commit — se
  // divergir de F1, commit_approval_resolution descarta tudo (V3.4).
  const contextResultF2 = await buildResolutionContext(supabase, {
    professionalId: params.professionalId,
    conversationId: params.conversationId,
    professionalStatementMessageId: params.professionalStatementMessageId,
    bookingId: params.bookingId,
    opportunityId: params.opportunityId,
    structuralFacts: params.structuralFacts,
  });
  if (contextResultF2.budgetExceeded) {
    // Contexto ficou over-budget entre F1 e F2 — trata como stale,
    // descarta e libera o claim (nunca commita sobre um F2 que nem é
    // representável). Mesmo registro de overflow operacional do ramo F1
    // (nunca approval_resolutions) — o resolver já foi chamado aqui,
    // mas nada do resultado é persistido como decisão comercial.
    await supabase.rpc('release_approval_resolution_claim', { p_message_id: params.professionalStatementMessageId, p_lease_token: leaseToken });
    const { error: overflowError } = await supabase.rpc('record_resolution_overflow', {
      p_message_id: params.professionalStatementMessageId,
      p_commercial_root_id: contextResultF2.commercialRootId,
      p_reason: contextResultF2.reason,
      p_decision_category: contextResultF2.decisionCategory ?? null,
      p_subject_key: contextResultF2.subjectKey ?? null,
      p_magnitude: contextResultF2.magnitude ?? null,
    });
    if (overflowError) throw new Error(`record_resolution_overflow falhou: ${overflowError.message}`);
    return { status: 'budget_exceeded', reason: contextResultF2.reason };
  }
  const f2 = computeContextIdentity(contextResultF2.context);

  const decisionsJson =
    output.outcome === 'resolved'
      ? output.decisions.map((d) => ({
          commercialRootId: d.commercialRootId,
          decisionCategory: d.decisionCategory,
          subjectKey: d.subjectKey,
          operationType: d.operationType,
          approvedValue: d.approvedValue,
          communicatedProposalMessageIds: d.communicatedProposalMessageIds,
          referredValue: d.referredValue,
        }))
      : [];

  const { data: commitRows, error: commitError } = await supabase.rpc('commit_approval_resolution', {
    p_message_id: params.professionalStatementMessageId,
    p_lease_token: leaseToken,
    p_commercial_root_id: contextF1.commercialRootId,
    p_inference_context_identity: contextIdentityToBytea(f1),
    p_current_context_identity: contextIdentityToBytea(f2),
    p_context_schema_version: contextF1.contextSchemaVersion,
    p_outcome: output.outcome,
    p_inconclusive_reason: output.outcome === 'inconclusive' ? output.reason : null,
    p_decisions: decisionsJson,
  });
  if (commitError) throw new Error(`commit_approval_resolution falhou: ${commitError.message}`);
  const commit = (Array.isArray(commitRows) ? commitRows[0] : commitRows) as CommitResolutionResult & {
    committed: boolean;
    discard_reason: string | null;
    approval_resolution_id: string | null;
    approval_record_ids: string[] | null;
  };

  if (!commit.committed) {
    if (commit.discard_reason === 'stale_context_discarded') {
      return { status: 'stale_context_discarded' };
    }
    return { status: 'not_eligible', reason: commit.discard_reason ?? 'unknown' };
  }

  return {
    status: 'committed',
    outcome: output.outcome,
    approvalResolutionId: commit.approval_resolution_id,
    approvalRecordIds: commit.approval_record_ids ?? [],
  };
}
