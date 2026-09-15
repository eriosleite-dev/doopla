import type { Opportunity } from '@/lib/supabase/types';
import { latestConversationByRelatedId, type ConversationOperationalFacts } from '@/lib/conversations/data';
import { groupDecisionsByConversation, type DecisionItem } from '@/lib/decisions/data';

import { classifyBookingAttention, wasBookingProposedByViewer } from './booking-attention';
import type { BookingWithOtherParty } from './data';
import { resolveDooplaIntervention } from './doopla-intervention';
import { PEDIDO_STATUS_LABEL, pedidoStatusTone } from './pedido-attention';
import { bookingStatusTone, type ProPillTone } from './pro-format';
import { STATUS_LABELS } from './ui';

// Bookings unificado (correção 15/09/2026, achado da fundadora) —
// "Bookings" passa a ser a superfície única dos trabalhos, qualquer
// que seja o canal de entrada (WhatsApp, link de booking/orçamento,
// futuramente e-mail). Este módulo é a CAMADA DE LEITURA que junta
// `bookings` (negociações já formalizadas) e `opportunities` com
// source='artist_link' ainda não convertidas (pedidos recebidos pelo
// link, ainda sem um booker/booking) numa única lista de "trabalhos" —
// nunca um novo modelo de dados paralelo: cada WorkItem só embrulha um
// registro que já existe, com um id+kind pra saber de qual tabela veio
// e pra onde a linha deve levar no detalhe.
//
// Import propositalmente NÃO inclui `opportunities` com
// source='mural' (o modelo antigo de matching/marketplace) — aquilo
// nunca deveria virar um "trabalho da Doopla" nesta lista.
//
// Auditoria (15/09/2026): hoje só bookings têm chance real de ter uma
// conversation vinculada (`related_booking_id`) — pedidos recebidos
// pelo link (`source='artist_link'`) em geral NASCEM sem conversation
// (gap de integração de `submit_orcamento_request`, sendo fechado à
// parte — ver PROGRESS.md). Por isso o canal de um pedido vem sempre
// do próprio `opportunities.source` ('Link de booking'), nunca de uma
// conversa.
//
// Correção 15/09/2026, 2ª rodada (achado da fundadora): "precisa de
// você" de um pedido NUNCA é inferido de `status === 'aberta'` — só do
// estado operacional real da conversation/decision vinculada
// (resolveDooplaIntervention, doopla-intervention.ts), a MESMA fonte
// usada pelo detalhe do pedido, pela Home e pelo badge de Bookings.
// Sem conversation ainda (o caso comum hoje), o pedido nunca aparece
// como "precisa de você" — fica em "em andamento" com label "Recebido"
// (honesto: a Doopla ainda não chegou a um ponto de decisão).
export type WorkAttention = 'precisa_de_voce' | 'em_andamento' | 'confirmado' | 'concluido' | 'cancelado';
export type WorkChannel = 'whatsapp' | 'public_link' | 'email' | 'painel' | 'outro';

export const WORK_CHANNEL_LABEL: Record<WorkChannel, string> = {
  whatsapp: 'WhatsApp',
  public_link: 'Link de booking',
  email: 'E-mail',
  painel: 'Painel',
  outro: 'Outro canal',
};

export type WorkItem = {
  id: string;
  kind: 'booking' | 'pedido';
  href: string;
  clientName: string;
  summary: string;
  eventDate: string | null;
  location: string | null;
  valueCents: number | null;
  channel: WorkChannel;
  attention: WorkAttention;
  statusLabel: string;
  statusTone: ProPillTone;
  sortDate: string;
};

const ATTENTION_ORDER: Record<WorkAttention, number> = {
  precisa_de_voce: 0,
  em_andamento: 1,
  confirmado: 2,
  concluido: 3,
  cancelado: 3,
};

function asWorkChannel(raw: string | undefined): WorkChannel {
  if (raw === 'whatsapp' || raw === 'public_link' || raw === 'email' || raw === 'painel' || raw === 'outro') return raw;
  return 'painel';
}

function bookingWorkItem(
  b: BookingWithOtherParty,
  userId: string,
  channelByBooking: Map<string, ConversationOperationalFacts>,
  pendingReview: boolean
): WorkItem {
  const bookingAttention = classifyBookingAttention(b, userId);
  const attention: WorkAttention = pendingReview
    ? 'precisa_de_voce'
    : bookingAttention === 'precisa_de_voce'
      ? 'precisa_de_voce'
      : bookingAttention === 'em_negociacao'
        ? 'em_andamento'
        : bookingAttention === 'confirmados'
          ? 'confirmado'
          : bookingAttention === 'concluidos'
            ? 'concluido'
            : 'cancelado';

  // "Doopla negociando" — relabel só de apresentação (achado da
  // fundadora, 15/09/2026): quando a proposta pendente é a do próprio
  // profissional (em_negociacao), o texto cru "Aguardando resposta" não
  // deixa claro que é a Doopla conduzindo, não o cliente. Nunca um
  // status novo no banco — só como esse grupo específico é rotulado.
  // Avaliação pendente (pendingReview) também vira "precisa de você" —
  // é uma ação transversal ao status do booking (mesma lógica de
  // TrabalhosList/ProTrabalhosView, que já tratava isso à parte de
  // classifyBookingAttention).
  const statusLabel = pendingReview
    ? 'Avaliar'
    : bookingAttention === 'em_negociacao' && !wasBookingProposedByViewer(b, userId)
      ? 'Doopla negociando'
      : (STATUS_LABELS[b.status] ?? b.status);

  const conversation = channelByBooking.get(b.id);

  return {
    id: b.id,
    kind: 'booking',
    href: `/dashboard/bookings/${b.id}`,
    clientName: b.otherPartyName,
    summary: b.description || 'Booking',
    eventDate: b.event_date,
    location: b.event_location,
    valueCents: b.cache_amount_cents,
    channel: conversation ? asWorkChannel(conversation.channel) : 'painel',
    attention,
    statusLabel,
    statusTone: bookingStatusTone(b, userId),
    sortDate: b.updated_at,
  };
}

function pedidoWorkItem(o: Opportunity, conversation: ConversationOperationalFacts | null, decision: DecisionItem | null): WorkItem {
  const clientName = o.client_name || 'Cliente sem nome';
  const isTerminal = o.status === 'cancelada' || o.status === 'booker_selecionado';

  let attention: WorkAttention;
  let statusLabel: string;
  let statusTone: ProPillTone;
  if (isTerminal) {
    attention = o.status === 'cancelada' ? 'cancelado' : 'concluido';
    statusLabel = PEDIDO_STATUS_LABEL[o.status] ?? o.status;
    statusTone = pedidoStatusTone(o);
  } else {
    const intervention = resolveDooplaIntervention(conversation, decision, clientName);
    attention = intervention.needsYou ? 'precisa_de_voce' : 'em_andamento';
    statusLabel = intervention.headline;
    statusTone = intervention.tone;
  }

  return {
    id: o.id,
    kind: 'pedido',
    href: `/dashboard/oportunidades/${o.id}`,
    clientName,
    summary: o.description,
    eventDate: o.event_date,
    location: o.location,
    valueCents: o.client_offered_cents,
    channel: 'public_link',
    attention,
    statusLabel,
    statusTone,
    sortDate: o.created_at,
  };
}

export function buildWorkItems(params: {
  bookings: BookingWithOtherParty[];
  pedidos: Opportunity[];
  userId: string;
  conversationFacts: ConversationOperationalFacts[];
  decisions?: DecisionItem[];
  pendingReviewBookingIds?: string[];
}): WorkItem[] {
  const channelByBooking = latestConversationByRelatedId(params.conversationFacts, 'relatedBookingId');
  const conversationByOpportunity = latestConversationByRelatedId(params.conversationFacts, 'relatedOpportunityId');
  const decisionByConversationId = new Map(
    groupDecisionsByConversation(params.decisions ?? []).map((d) => [d.conversationId, d])
  );
  const pendingReviewSet = new Set(params.pendingReviewBookingIds ?? []);
  const items = [
    ...params.bookings.map((b) => bookingWorkItem(b, params.userId, channelByBooking, pendingReviewSet.has(b.id))),
    ...params.pedidos.map((o) => {
      const conversation = conversationByOpportunity.get(o.id) ?? null;
      const decision = conversation ? (decisionByConversationId.get(conversation.conversationId) ?? null) : null;
      return pedidoWorkItem(o, conversation, decision);
    }),
  ];

  // Ordenação: urgência primeiro (precisa de você > em andamento >
  // confirmado > concluído/cancelado); dentro de precisa_de_voce/
  // em_andamento, mais recente primeiro (item "vivo"); dentro de
  // confirmado, data do evento mais próxima primeiro (relevância
  // temporal, nunca created_at cru) — requisito explícito da
  // fundadora.
  return items.sort((a, b) => {
    const orderDiff = ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
    if (orderDiff !== 0) return orderDiff;
    if (a.attention === 'confirmado') {
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate.localeCompare(b.eventDate);
    }
    return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
  });
}
