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

// Uma conversa pode gerar 2 linhas em listActionableDecisions ao mesmo
// tempo (um pending_reply E um prepared_draft) — isso é uma divergência
// real de contagem descoberta na revisão do Professional Web Dashboard
// (06/09/2026): a Home mostrava 17 conversas "precisam de você" no
// card/badge (contagem por CONVERSA, via
// getCachedConversationStateSummary) mas 20 no accordion "Precisa de
// você" (contagem por LINHA de decisão). Esta função agrupa por
// conversationId ANTES de exibir, pra "Precisa de você" nunca contar
// diferente do resto da Home/sidebar — sempre 1 card por conversa.
// Quando uma conversa tem as duas linhas, prepared_draft vence (é o
// estado mais avançado: já existe uma resposta pronta, só falta
// revisar/enviar — mais acionável que um pending_reply genérico).
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

// Ordena "Precisa de você" por prioridade e depois por mais antigo
// aguardando ação (item 4 da revisão): prepared_draft primeiro (já tem
// uma resposta pronta, menor esforço pro profissional agir), depois
// pending_reply comum (a Doopla está parada esperando uma decisão),
// depois pending_reply bloqueado por dado operacional faltando (exige
// mais fricção — ir preencher algo antes de continuar). Dentro de cada
// prioridade, o mais antigo vem primeiro.
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

// Rodada de correção/consistência (06/09/2026) — histórico de
// "Resolvidas". Mesma filosofia de listActionableDecisions: só LÊ fatos
// já gravados por Runtime/Approval Engine/Policy Gate, nunca reinterpreta.
// Duas fontes reais de "isto já foi decidido", nunca uma terceira
// inventada:
//   - runtime_pending_replies com status IN ('completed','superseded')
//     — a pendência que bloqueava o turno deixou de existir.
//   - conversation_messages com replied_to_outbound_intent_id
//     preenchido (migration 0066) — um rascunho preparado (prepared_draft)
//     foi respondido (prepared_response_outcome 'sent'/'edited').
// "Resolvida por você": hoje só o profissional resolve (nenhuma
// capability de decisão do Booker existe ainda) — decisão explícita do
// usuário de NÃO adicionar coluna de autoria antecipadamente; quando o
// Booker ganhar essa capability, autoria/auditoria entra junto daquele
// bloco, não aqui.
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

function pendingReplyOutcomeLabel(status: string, supersededById: string | null): string {
  if (status === 'completed') return 'Você respondeu e a Doopla retomou a conversa.';
  if (supersededById) return 'Substituída por uma decisão mais recente na mesma conversa.';
  return 'Encerrada — a negociação nesta conversa chegou ao fim.';
}

function preparedDraftOutcomeLabel(outcome: string | null): string {
  if (outcome === 'edited') return 'Você editou o rascunho da Doopla antes de enviar.';
  return 'Você aprovou e enviou o rascunho da Doopla.';
}

export async function listResolvedDecisions(supabase: AnySupabaseClient, limit = 50): Promise<ResolvedDecisionItem[]> {
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

  const resolvedReplies = resolvedRepliesResult.data ?? [];
  const resolvedMessages = resolvedMessagesResult.data ?? [];

  const conversationIds = [...new Set([...resolvedReplies.map((r) => r.conversation_id), ...resolvedMessages.map((m) => m.conversation_id)])];
  const { data: conversations } = conversationIds.length
    ? await supabase.from('conversations').select('id, related_booking_id').in('id', conversationIds).returns<{ id: string; related_booking_id: string | null }[]>()
    : { data: [] as { id: string; related_booking_id: string | null }[] };
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
