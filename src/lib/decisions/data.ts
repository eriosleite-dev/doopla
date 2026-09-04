import type { SupabaseClient } from '@supabase/supabase-js';

// Professional Product UI — Foundation. Boundary de leitura tipado
// pra futura tela de Decisões/Approvals — NUNCA constrói a tela aqui,
// só o contrato. Consome exclusivamente o que o Runtime/Approval
// Engine/Policy Gate já escreveram (runtime_pending_replies,
// policy_gate_decisions, outbound_intents, conversations) — nenhuma
// lógica nova de aprovação, nenhum jeito de uma UI futura contornar
// Mandate -> Approval -> Policy Gate: este arquivo só LÊ o que essas
// camadas já decidiram, sob a MESMA RLS que já protege leitura direta
// dessas tabelas (nenhum filtro de posse duplicado aqui, mesma
// filosofia de get_conversation_operational_facts/runtime-state-reads.ts).
//
// Dois tipos de "precisa de decisão", nunca confundidos:
//   - 'pending_reply': o Approval Engine ficou bloqueado esperando uma
//     decisão do profissional pra retomar o turno do cliente
//     (runtime_pending_replies.status='pending'). policyGateBlockReason
//     explica O PORQUÊ, lido de policy_gate_decisions (nunca
//     reinterpretado, nunca re-decidido aqui).
//   - 'prepared_draft': existe um outbound_intent já autorizado pelo
//     Post-model Gate, ainda não enviado (delivery_state='policy_allowed')
//     — mesmo sinal que já alimenta o estado 'needs_you' em
//     src/lib/conversations/state.ts. preparedContent é o rascunho.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type DecisionItemKind = 'pending_reply' | 'prepared_draft';

export type DecisionItem = {
  id: string;
  kind: DecisionItemKind;
  conversationId: string;
  relatedBookingId: string | null;
  relatedOpportunityId: string | null;
  commercialRootId: string | null;
  createdAt: string;
  // pending_reply: true só quando status='pending' (nunca
  // completed/superseded — isso já não é mais acionável, é histórico).
  // prepared_draft: sempre true (delivery_state='policy_allowed' já É
  // a única condição de existir aqui).
  isActionable: boolean;
  // Só presente em 'pending_reply' — por que o Gate bloqueou este
  // turno, direto de policy_gate_decisions, nunca reinterpretado.
  blockReason: string | null;
  // Evidência já disponível (policy_gate_decisions.checks) — nunca
  // recomputada, só repassada.
  checks: unknown[] | null;
  // Só presente em 'prepared_draft' — o rascunho já autorizado, ainda
  // não enviado.
  preparedContent: string | null;
};

type RawPendingReplyRow = {
  id: string;
  conversation_id: string;
  commercial_root_id: string;
  policy_gate_decision_id: string;
  status: string;
  created_at: string;
};

type RawPolicyGateDecisionRow = {
  id: string;
  primary_block_reason: string | null;
  checks: unknown[];
};

type RawOutboundIntentRow = {
  id: string;
  conversation_id: string;
  professional_id: string;
  content: string;
  delivery_state: string;
  created_at: string;
};

type RawConversationRow = {
  id: string;
  related_booking_id: string | null;
  related_opportunity_id: string | null;
};

// Lista tudo que hoje "precisa de decisão" do profissional autenticado
// — pending_replies com status='pending' + outbound_intents com
// delivery_state='policy_allowed'. Cada leitura já é filtrada por RLS
// (runtime_pending_replies: select own via conversations, migration
// 0056; outbound_intents/policy_gate_decisions: select own direto,
// professional_id=auth.uid()) — sem .eq() de posse adicional aqui, de
// propósito, mesma filosofia de runtime-state-reads.ts.
export async function listActionableDecisions(supabase: AnySupabaseClient): Promise<DecisionItem[]> {
  const [pendingRepliesResult, outboundIntentsResult] = await Promise.all([
    supabase
      .from('runtime_pending_replies')
      .select('id, conversation_id, commercial_root_id, policy_gate_decision_id, status, created_at')
      .eq('status', 'pending')
      .returns<RawPendingReplyRow[]>(),
    supabase
      .from('outbound_intents')
      .select('id, conversation_id, professional_id, content, delivery_state, created_at')
      .eq('delivery_state', 'policy_allowed')
      .returns<RawOutboundIntentRow[]>(),
  ]);

  const pendingReplies = pendingRepliesResult.data ?? [];
  const outboundIntents = outboundIntentsResult.data ?? [];

  const conversationIds = [...new Set([...pendingReplies.map((r) => r.conversation_id), ...outboundIntents.map((o) => o.conversation_id)])];
  const policyGateDecisionIds = [...new Set(pendingReplies.map((r) => r.policy_gate_decision_id))];

  const [conversationsResult, policyGateDecisionsResult] = await Promise.all([
    conversationIds.length
      ? supabase.from('conversations').select('id, related_booking_id, related_opportunity_id').in('id', conversationIds).returns<RawConversationRow[]>()
      : Promise.resolve({ data: [] as RawConversationRow[] }),
    policyGateDecisionIds.length
      ? supabase.from('policy_gate_decisions').select('id, primary_block_reason, checks').in('id', policyGateDecisionIds).returns<RawPolicyGateDecisionRow[]>()
      : Promise.resolve({ data: [] as RawPolicyGateDecisionRow[] }),
  ]);

  const conversationById = new Map((conversationsResult.data ?? []).map((c) => [c.id, c]));
  const policyGateDecisionById = new Map((policyGateDecisionsResult.data ?? []).map((d) => [d.id, d]));

  const fromPendingReplies: DecisionItem[] = pendingReplies.map((r) => {
    const conversation = conversationById.get(r.conversation_id);
    const gateDecision = policyGateDecisionById.get(r.policy_gate_decision_id);
    return {
      id: r.id,
      kind: 'pending_reply',
      conversationId: r.conversation_id,
      relatedBookingId: conversation?.related_booking_id ?? null,
      relatedOpportunityId: conversation?.related_opportunity_id ?? null,
      commercialRootId: r.commercial_root_id,
      createdAt: r.created_at,
      isActionable: r.status === 'pending',
      blockReason: gateDecision?.primary_block_reason ?? null,
      checks: gateDecision?.checks ?? null,
      preparedContent: null,
    };
  });

  const fromDrafts: DecisionItem[] = outboundIntents.map((o) => {
    const conversation = conversationById.get(o.conversation_id);
    return {
      id: o.id,
      kind: 'prepared_draft',
      conversationId: o.conversation_id,
      relatedBookingId: conversation?.related_booking_id ?? null,
      relatedOpportunityId: conversation?.related_opportunity_id ?? null,
      commercialRootId: null,
      createdAt: o.created_at,
      isActionable: true,
      blockReason: null,
      checks: null,
      preparedContent: o.content,
    };
  });

  return [...fromPendingReplies, ...fromDrafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
