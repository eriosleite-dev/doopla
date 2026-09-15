import type { Opportunity } from '@/lib/supabase/types';
import type { ConversationOperationalFacts } from '@/lib/conversations/data';

import { classifyBookingAttention, wasBookingProposedByViewer } from './booking-attention';
import type { BookingWithOtherParty } from './data';
import { classifyPedidoAttention, PEDIDO_STATUS_LABEL, pedidoStatusTone } from './pedido-attention';
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
// pelo link (`source='artist_link'`) NASCEM sem conversation, porque
// `submit_orcamento_request` (migration 0023, RPC pública/anônima) não
// pode chamar `create_conversation()` sem um caminho de sistema
// (service_role/`is_system_caller()`, adicionado em 0062 só pro
// webhook de WhatsApp) — chamar direto do formulário público falharia
// com `not_authorized`, e duplicar a lógica de `create_conversation`
// aqui seria exatamente o "sistema paralelo" que não queremos. Por
// isso o canal de um pedido vem sempre do próprio
// `opportunities.source` ('Link de booking'), nunca de uma conversa —
// e a integração completa (pedido do link nascendo com conversa, igual
// já acontece no WhatsApp) fica registrada como pendência em
// PROGRESS.md, não implementada nesta correção.
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

function latestConversationByBooking(facts: ConversationOperationalFacts[]): Map<string, ConversationOperationalFacts> {
  const byBooking = new Map<string, ConversationOperationalFacts>();
  for (const fact of facts) {
    if (!fact.relatedBookingId) continue;
    const existing = byBooking.get(fact.relatedBookingId);
    if (!existing || fact.lastActivityAt > existing.lastActivityAt) byBooking.set(fact.relatedBookingId, fact);
  }
  return byBooking;
}

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

function pedidoWorkItem(o: Opportunity): WorkItem {
  const pedidoAttention = classifyPedidoAttention(o);
  const attention: WorkAttention =
    pedidoAttention === 'precisa_de_voce' ? 'precisa_de_voce' : pedidoAttention === 'em_andamento' ? 'em_andamento' : o.status === 'cancelada' ? 'cancelado' : 'concluido';

  return {
    id: o.id,
    kind: 'pedido',
    href: `/dashboard/oportunidades/${o.id}`,
    clientName: o.client_name || 'Cliente sem nome',
    summary: o.description,
    eventDate: o.event_date,
    location: o.location,
    valueCents: o.client_offered_cents,
    channel: 'public_link',
    attention,
    statusLabel: PEDIDO_STATUS_LABEL[o.status] ?? o.status,
    statusTone: pedidoStatusTone(o),
    sortDate: o.created_at,
  };
}

export function buildWorkItems(params: {
  bookings: BookingWithOtherParty[];
  pedidos: Opportunity[];
  userId: string;
  conversationFacts: ConversationOperationalFacts[];
  pendingReviewBookingIds?: string[];
}): WorkItem[] {
  const channelByBooking = latestConversationByBooking(params.conversationFacts);
  const pendingReviewSet = new Set(params.pendingReviewBookingIds ?? []);
  const items = [
    ...params.bookings.map((b) => bookingWorkItem(b, params.userId, channelByBooking, pendingReviewSet.has(b.id))),
    ...params.pedidos.map(pedidoWorkItem),
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
