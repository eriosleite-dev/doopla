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
// Arquitetura de Bookings alto-volume (achado da fundadora, 30/09/2026)
// — correção sobre o modelo anterior: `stage` (estágio) e `needsYou`
// (atenção humana) viram DUAS dimensões independentes, nunca um enum
// só. `stage` é derivado SÓ do status real (bookings.status /
// opportunities.status), nunca sabe de "quem precisa agir" — é a fonte
// das tabs fixas (Em negociação/Confirmados/Concluídos/Todos).
// `needsYou` é um boolean à parte, mesmos sinais de sempre
// (classifyBookingAttention pra booking, resolveDooplaIntervention pra
// pedido — nenhum sinal novo, nenhuma mudança de fonte), vira só o
// badge "Precisa de você" sobre qualquer stage. Antes, `WorkAttention`
// colapsava as duas coisas num enum só (ex.: um booking com proposta
// pendente do cliente virava 'precisa_de_voce', nunca aparecendo como
// "em negociação" de verdade) — removido.
export type WorkStage = 'negociacao' | 'confirmado' | 'concluido' | 'outro';
export type WorkChannel = 'whatsapp' | 'public_link' | 'email' | 'painel' | 'outro';

export const WORK_CHANNEL_LABEL: Record<WorkChannel, string> = {
  whatsapp: 'WhatsApp',
  public_link: 'Link de booking',
  email: 'E-mail',
  painel: 'Painel',
  outro: 'Outro canal',
};

export const WORK_STAGE_LABEL: Record<WorkStage, string> = {
  negociacao: 'Em negociação',
  confirmado: 'Confirmados',
  concluido: 'Concluídos',
  outro: 'Outros',
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
  stage: WorkStage;
  needsYou: boolean;
  statusLabel: string;
  statusTone: ProPillTone;
  sortDate: string;
  // Filtro de Contrato (auditoria de Booking Detail/Contratos,
  // 15/09/2026) — só a informação real existente hoje
  // (bookings.contract_url), nunca um contract_type inventado. Pedidos
  // (opportunities ainda não convertidas em booking) nunca têm
  // contrato — essa coluna só existe em `bookings`.
  hasContract: boolean;
};

const STAGE_ORDER: Record<WorkStage, number> = {
  negociacao: 0,
  confirmado: 1,
  concluido: 2,
  outro: 3,
};

function asWorkChannel(raw: string | undefined): WorkChannel {
  if (raw === 'whatsapp' || raw === 'public_link' || raw === 'email' || raw === 'painel' || raw === 'outro') return raw;
  return 'painel';
}

// Estágio é SÓ o status real do booking — nunca sabe quem propôs nem
// se há pendência. `aceita`/`aguardando_pagamento` ficam juntos em
// "Confirmados" (mesmo agrupamento que `classifyBookingAttention` já
// usava pro filtro antigo). `recusada`/`cancelada` não ganham tab
// própria (pedido explícito da fundadora) — caem em 'outro', visível
// só em "Todos" + filtro.
function bookingStage(status: BookingWithOtherParty['status']): WorkStage {
  if (status === 'proposta_enviada') return 'negociacao';
  if (status === 'aceita' || status === 'aguardando_pagamento') return 'confirmado';
  if (status === 'concluida') return 'concluido';
  return 'outro'; // recusada | cancelada
}

function bookingWorkItem(
  b: BookingWithOtherParty,
  userId: string,
  channelByBooking: Map<string, ConversationOperationalFacts>,
  pendingReview: boolean
): WorkItem {
  const bookingAttention = classifyBookingAttention(b, userId);
  // needsYou nunca é o status — é só "existe uma proposta pendente da
  // OUTRA parte" (mesmo sinal de sempre, classifyBookingAttention) ou
  // uma avaliação pendente (transversal ao status, igual já era antes).
  const needsYou = pendingReview || bookingAttention === 'precisa_de_voce';

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
    stage: bookingStage(b.status),
    needsYou,
    statusLabel,
    statusTone: bookingStatusTone(b, userId),
    sortDate: b.updated_at,
    hasContract: b.contract_url != null,
  };
}

// Pedido (opportunity ainda não convertida) não tem bookings.status —
// a tabela de estágios da fundadora é sobre booking, então um pedido
// não-terminal (ainda sendo formalizado) cai em "Em negociação", o
// mais próximo do que ele realmente é. Terminal (`cancelada`/
// `booker_selecionado`) cai em 'outro', mesmo tratamento de
// recusada/cancelada — sem tab própria. Divergência sinalizada à
// fundadora antes de implementar (30/09/2026); ajustar aqui se a
// decisão for outra.
function pedidoWorkItem(o: Opportunity, conversation: ConversationOperationalFacts | null, decision: DecisionItem | null): WorkItem {
  const clientName = o.client_name || 'Cliente sem nome';
  const isTerminal = o.status === 'cancelada' || o.status === 'booker_selecionado';

  let stage: WorkStage;
  let needsYou: boolean;
  let statusLabel: string;
  let statusTone: ProPillTone;
  if (isTerminal) {
    stage = 'outro';
    needsYou = false;
    statusLabel = PEDIDO_STATUS_LABEL[o.status] ?? o.status;
    statusTone = pedidoStatusTone(o);
  } else {
    stage = 'negociacao';
    const intervention = resolveDooplaIntervention(conversation, decision, clientName);
    needsYou = intervention.needsYou;
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
    stage,
    needsYou,
    statusLabel,
    statusTone,
    sortDate: o.created_at,
    hasContract: false,
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

  // Ordenação por tab (requisito explícito da fundadora, 30/09/2026):
  // "Em negociação" → precisa de você primeiro, depois mais recente;
  // "Confirmados" → próximo evento primeiro (nunca created_at cru);
  // "Concluídos"/"outro" → mais recente primeiro. A lista já sai
  // ordenada assim pra "Todos" também (stage em ordem, cada bloco já
  // na ordem certa por dentro) — os componentes de tab só filtram por
  // `stage` em cima deste array, nunca reordenam.
  return items.sort((a, b) => {
    const stageDiff = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
    if (stageDiff !== 0) return stageDiff;
    if (a.stage === 'negociacao') {
      if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
      return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
    }
    if (a.stage === 'confirmado') {
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate.localeCompare(b.eventDate);
    }
    return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
  });
}
