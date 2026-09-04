import { supabase } from '@/lib/supabase';

// Espelha src/lib/decisions/data.ts (painel web) — mesmo contrato,
// mesmas tabelas (runtime_pending_replies/policy_gate_decisions/
// outbound_intents/conversations), mesma RLS. Cópia deliberada, sem
// grafo de import compartilhado entre Web e Mobile. NÃO constrói tela
// — só o boundary de leitura (mais/decisoes.tsx continua placeholder).

export type DecisionItemKind = 'pending_reply' | 'prepared_draft';

export type DecisionItem = {
  id: string;
  kind: DecisionItemKind;
  conversationId: string;
  relatedBookingId: string | null;
  relatedOpportunityId: string | null;
  commercialRootId: string | null;
  createdAt: string;
  isActionable: boolean;
  blockReason: string | null;
  checks: unknown[] | null;
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

export async function fetchActionableDecisions(): Promise<DecisionItem[]> {
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
  if (pendingRepliesResult.error) throw pendingRepliesResult.error;
  if (outboundIntentsResult.error) throw outboundIntentsResult.error;

  const pendingReplies = pendingRepliesResult.data ?? [];
  const outboundIntents = outboundIntentsResult.data ?? [];

  const conversationIds = [...new Set([...pendingReplies.map((r) => r.conversation_id), ...outboundIntents.map((o) => o.conversation_id)])];
  const policyGateDecisionIds = [...new Set(pendingReplies.map((r) => r.policy_gate_decision_id))];

  const [conversationsResult, policyGateDecisionsResult] = await Promise.all([
    conversationIds.length
      ? supabase.from('conversations').select('id, related_booking_id, related_opportunity_id').in('id', conversationIds).returns<RawConversationRow[]>()
      : Promise.resolve({ data: [] as RawConversationRow[], error: null }),
    policyGateDecisionIds.length
      ? supabase.from('policy_gate_decisions').select('id, primary_block_reason, checks').in('id', policyGateDecisionIds).returns<RawPolicyGateDecisionRow[]>()
      : Promise.resolve({ data: [] as RawPolicyGateDecisionRow[], error: null }),
  ]);
  if (conversationsResult.error) throw conversationsResult.error;
  if (policyGateDecisionsResult.error) throw policyGateDecisionsResult.error;

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
