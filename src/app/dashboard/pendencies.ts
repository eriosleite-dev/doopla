import type { SupabaseClient } from '@supabase/supabase-js';

import { latestConversationByRelatedId } from '@/lib/conversations/data';
import { decisionPriority, groupDecisionsByConversation, sortDecisionsByPriority } from '@/lib/decisions/data';
import type { Profile } from '@/lib/supabase/types';

import { classifyBookingAttention } from './booking-attention';
import { getMyOpportunities, getUserBookings } from './data';
import { conversationHref, decisionBlockReasonLabel } from './decisoes/format-cards';
import { resolveDooplaIntervention } from './doopla-intervention';
import { getCachedActionableDecisions, getCachedConversationOperationalFacts, getCachedConversationStateSummary } from './pro-home-cache';
import { bookingStatusTone, formatRelativeTime, proStatusPillClass } from './pro-format';
import type { PendencyRow } from './pro-needs-you-list';
import { STATUS_LABELS } from './ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

// Extraído de professional-home-view.tsx (Notification Center,
// 01/10/2026) — fonte canônica de "Precisa de você", agora
// compartilhada por Home, badge da sidebar (layout.tsx) e Notification
// Center, nunca mais recalculada 3 vezes. Zero mudança de lógica nesta
// extração — mesmas 3 fontes (pedidos recebidos pelo link, bookings
// aguardando resposta, decisões de conversa), mesma prioridade/
// ordenação já aprovada em 01/10.
//
// ATENÇÃO (decisão explícita da fundadora, 01/10/2026): a sessão
// "Geral" está corrigindo em paralelo a fonte canônica de needs_you
// (requires_professional_review). Esta função não inventa nenhuma
// regra própria — é só a extração do que já existia aqui. Quando
// aquela correção entrar na canônica, faça rebase desta branch e
// ajuste esta função pra consumir a fonte corrigida — nunca antes
// disso.
export async function getPendencyRows(userId: string, profile: Profile, supabase: AnySupabaseClient): Promise<PendencyRow[]> {
  const [decisions, conversationSummary, conversationFacts, bookings, opportunities] = await Promise.all([
    getCachedActionableDecisions(supabase),
    getCachedConversationStateSummary(supabase),
    getCachedConversationOperationalFacts(supabase),
    getUserBookings(userId, profile.role, supabase),
    getMyOpportunities(userId, supabase),
  ]);

  const conversationByOpportunity = latestConversationByRelatedId(conversationFacts, 'relatedOpportunityId');
  const decisionByConversationId = new Map(groupDecisionsByConversation(decisions).map((d) => [d.conversationId, d]));
  const pedidosRecebidosAbertos = opportunities
    .filter((o) => o.source === 'artist_link' && o.status !== 'cancelada' && o.status !== 'booker_selecionado')
    .map((o) => {
      const conversation = conversationByOpportunity.get(o.id) ?? null;
      const decision = conversation ? (decisionByConversationId.get(conversation.conversationId) ?? null) : null;
      return { opportunity: o, intervention: resolveDooplaIntervention(conversation, decision, o.client_name || 'o cliente') };
    })
    .filter((item) => item.intervention.needsYou);

  const needsYouDecisions = sortDecisionsByPriority(
    groupDecisionsByConversation(decisions).filter(
      (d) => conversationSummary.needsYouConversationIds.includes(d.conversationId) && d.relatedOpportunityId == null
    )
  );

  const bookingsNeedingResponse = bookings.filter((b) => classifyBookingAttention(b, userId) === 'precisa_de_voce');

  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  const pedidoRows: PendencyRow[] = pedidosRecebidosAbertos.map(({ opportunity: o, intervention }) => ({
    id: `pedido-${o.id}`,
    href: `/dashboard/oportunidades/${o.id}`,
    name: o.client_name || 'Novo pedido',
    detail: intervention.detail,
    right: { kind: 'pill', label: intervention.headline, className: proStatusPillClass(intervention.tone) },
  }));
  const pedidoSortAt = new Map(pedidosRecebidosAbertos.map(({ opportunity: o }) => [`pedido-${o.id}`, o.created_at]));

  const bookingRows: PendencyRow[] = bookingsNeedingResponse.map((b) => ({
    id: `booking-${b.id}`,
    href: `/dashboard/bookings/${b.id}`,
    name: b.otherPartyName,
    detail: 'Proposta de booking aguardando sua resposta.',
    right: { kind: 'pill', label: STATUS_LABELS[b.status], className: proStatusPillClass(bookingStatusTone(b, userId)) },
  }));
  const bookingSortAt = new Map(bookingsNeedingResponse.map((b) => [`booking-${b.id}`, b.updated_at]));

  const decisionRows: PendencyRow[] = needsYouDecisions.map((d) => {
    const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
    return {
      id: `decision-${d.id}`,
      href: conversationHref(d.relatedBookingId, d.conversationId),
      name: booking?.otherPartyName ?? 'Conversa em andamento',
      detail: d.kind === 'prepared_draft' ? 'A Doopla preparou uma resposta. Revise antes de enviar.' : decisionBlockReasonLabel(d.blockReason),
      right: { kind: 'time', label: formatRelativeTime(d.createdAt) },
    };
  });
  const decisionPriorityAndSortAt = new Map(
    needsYouDecisions.map((d) => [`decision-${d.id}`, { priority: decisionPriority(d), sortAt: d.createdAt }])
  );

  return [...pedidoRows, ...bookingRows, ...decisionRows].sort((a, b) => {
    const priorityOf = (row: PendencyRow) => decisionPriorityAndSortAt.get(row.id)?.priority ?? 1;
    const sortAtOf = (row: PendencyRow) =>
      decisionPriorityAndSortAt.get(row.id)?.sortAt ?? pedidoSortAt.get(row.id) ?? bookingSortAt.get(row.id) ?? '';
    const priorityDiff = priorityOf(a) - priorityOf(b);
    if (priorityDiff !== 0) return priorityDiff;
    return sortAtOf(b).localeCompare(sortAtOf(a));
  });
}
