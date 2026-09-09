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

// Espelha groupDecisionsByConversation/sortDecisionsByPriority (painel
// web, src/lib/decisions/data.ts) — mesma regra: 1 card por conversa
// (prepared_draft vence quando a mesma conversa tem as duas linhas),
// prioridade prepared_draft > pending_reply comum > pending_reply
// bloqueado por dado operacional faltando; dentro de cada prioridade,
// mais antigo primeiro.
export function groupDecisionsByConversation(decisions: DecisionItem[]): DecisionItem[] {
  const byConversation = new Map<string, DecisionItem>();
  for (const d of decisions) {
    const existing = byConversation.get(d.conversationId);
    if (!existing || (existing.kind === 'pending_reply' && d.kind === 'prepared_draft')) {
      byConversation.set(d.conversationId, d);
    }
  }
  return [...byConversation.values()];
}

const DECISION_PRIORITY = (d: DecisionItem): number => {
  if (d.kind === 'prepared_draft') return 0;
  if (d.blockReason === 'professional_not_operationally_ready') return 2;
  return 1;
};

export function sortDecisionsByPriority(decisions: DecisionItem[]): DecisionItem[] {
  return [...decisions].sort((a, b) => {
    const priorityDiff = DECISION_PRIORITY(a) - DECISION_PRIORITY(b);
    if (priorityDiff !== 0) return priorityDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// Espelha listResolvedDecisions (painel web) — mesmas duas fontes reais
// de "isto já foi decidido", mesma regra de rótulo, nenhuma terceira
// fonte inventada.
export type ResolvedDecisionItem = {
  id: string;
  conversationId: string;
  relatedBookingId: string | null;
  resolvedAt: string;
  outcomeLabel: string;
};

type RawResolvedPendingReplyRow = {
  id: string;
  conversation_id: string;
  status: string;
  resolved_at: string | null;
  superseded_by_id: string | null;
};

type RawResolvedMessageRow = {
  id: string;
  conversation_id: string;
  created_at: string;
  prepared_response_outcome: string | null;
};

// Exportadas (correção 09/09/2026, C4) — DecisionCard.tsx e
// mais/decisoes.tsx importam daqui em vez de reimplementar o mesmo
// texto, pra nunca existir uma terceira versão divergente do rótulo.
export function pendingReplyOutcomeLabel(status: string | null, supersededById: string | null): string {
  if (status === 'completed') return 'Você respondeu e a Doopla retomou a conversa.';
  if (supersededById) return 'Substituída por uma decisão mais recente na mesma conversa.';
  return 'Encerrada — a negociação nesta conversa chegou ao fim.';
}

export function preparedDraftOutcomeLabel(outcome: string | null): string {
  if (outcome === 'edited') return 'Você editou o rascunho da Doopla antes de enviar.';
  return 'Você aprovou e enviou o rascunho da Doopla.';
}

export async function fetchResolvedDecisions(limit = 50): Promise<ResolvedDecisionItem[]> {
  const [resolvedRepliesResult, resolvedMessagesResult] = await Promise.all([
    supabase
      .from('runtime_pending_replies')
      .select('id, conversation_id, status, resolved_at, superseded_by_id')
      .in('status', ['completed', 'superseded'])
      .order('resolved_at', { ascending: false })
      .limit(limit)
      .returns<RawResolvedPendingReplyRow[]>(),
    supabase
      .from('conversation_messages')
      .select('id, conversation_id, created_at, prepared_response_outcome')
      .not('replied_to_outbound_intent_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<RawResolvedMessageRow[]>(),
  ]);
  if (resolvedRepliesResult.error) throw resolvedRepliesResult.error;
  if (resolvedMessagesResult.error) throw resolvedMessagesResult.error;

  const resolvedReplies = resolvedRepliesResult.data ?? [];
  const resolvedMessages = resolvedMessagesResult.data ?? [];

  const conversationIds = [...new Set([...resolvedReplies.map((r) => r.conversation_id), ...resolvedMessages.map((m) => m.conversation_id)])];
  const { data: conversations, error: conversationsError } = conversationIds.length
    ? await supabase.from('conversations').select('id, related_booking_id').in('id', conversationIds).returns<{ id: string; related_booking_id: string | null }[]>()
    : { data: [] as { id: string; related_booking_id: string | null }[], error: null };
  if (conversationsError) throw conversationsError;
  const conversationById = new Map((conversations ?? []).map((c) => [c.id, c]));

  const fromReplies: ResolvedDecisionItem[] = resolvedReplies
    .filter((r) => r.resolved_at)
    .map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      relatedBookingId: conversationById.get(r.conversation_id)?.related_booking_id ?? null,
      resolvedAt: r.resolved_at as string,
      outcomeLabel: pendingReplyOutcomeLabel(r.status, r.superseded_by_id),
    }));

  const fromMessages: ResolvedDecisionItem[] = resolvedMessages.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    relatedBookingId: conversationById.get(m.conversation_id)?.related_booking_id ?? null,
    resolvedAt: m.created_at,
    outcomeLabel: preparedDraftOutcomeLabel(m.prepared_response_outcome),
  }));

  return [...fromReplies, ...fromMessages].sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt)).slice(0, limit);
}

// Paginação real server-side (migration 0070) — espelha exatamente
// src/lib/decisions/data.ts (Web): mesmas 2 RPCs
// (list_actionable_decisions_page/list_resolved_decisions_page), que
// já fazem agrupamento por conversa (só a fila acionável — resolvidas
// nunca agrupam), ordenação e LIMIT/OFFSET em SQL, com total real via
// count(*) over(). Sem infinite scroll, sem paginação numérica — o
// caller mantém o offset local pro "Carregar mais".
export type ActionableDecisionSort = 'recentes' | 'antigas' | 'prioridade';
export type ResolvedDecisionSort = 'recentes' | 'antigas';

export type RawActionableDecisionPageRow = {
  id: string;
  kind: DecisionItemKind;
  conversation_id: string;
  related_booking_id: string | null;
  related_opportunity_id: string | null;
  commercial_root_id: string | null;
  created_at: string;
  block_reason: string | null;
  prepared_content: string | null;
  total_count: number;
};

export type RawResolvedDecisionPageRow = {
  id: string;
  conversation_id: string;
  related_booking_id: string | null;
  resolved_at: string;
  status: string | null;
  superseded_by_id: string | null;
  prepared_response_outcome: string | null;
  source: DecisionItemKind;
  total_count: number;
};

export async function fetchActionableDecisionsPage(args: {
  sort: ActionableDecisionSort;
  limit: number;
  offset: number;
}): Promise<{ rows: RawActionableDecisionPageRow[]; totalCount: number }> {
  const { data, error } = await supabase.rpc('list_actionable_decisions_page', {
    p_sort: args.sort,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as RawActionableDecisionPageRow[];
  return { rows, totalCount: rows[0]?.total_count ?? 0 };
}

export async function fetchResolvedDecisionsPage(args: {
  sort: ResolvedDecisionSort;
  limit: number;
  offset: number;
}): Promise<{ rows: RawResolvedDecisionPageRow[]; totalCount: number }> {
  const { data, error } = await supabase.rpc('list_resolved_decisions_page', {
    p_sort: args.sort,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as RawResolvedDecisionPageRow[];
  return { rows, totalCount: rows[0]?.total_count ?? 0 };
}

export function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  if (reason === 'professional_not_operationally_ready') {
    return 'Precisa confirmar alguns dados antes da Doopla continuar por você.';
  }
  return 'A Doopla pausou aqui e precisa de você pra seguir.';
}
