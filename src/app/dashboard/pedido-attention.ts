import type { Opportunity } from '@/lib/supabase/types';

import type { ProPillTone } from './pro-format';

// Pedidos = solicitações recebidas pelo link de booking/orçamento,
// ainda em negociação — distinto de Bookings, que já avançaram pra um
// trabalho fechado (correção 15/09/2026, achado da fundadora). Mesma
// ideia de booking-attention.ts: nunca esconder urgência atrás de
// ordem cronológica.
//
// `em_distribuicao`/`interesse_recebido` são estados do modelo antigo
// de distribuição pra booker (mural) — um pedido recebido via
// artist_link nunca deveria nascer nesses estados (distribution_mode
// sempre 'meus_bookers' nesse fluxo), mas cobrimos defensivamente caso
// exista dado histórico, sem tratá-los como "precisa de você" nem
// como encerrados.
export type PedidoAttentionGroup = 'precisa_de_voce' | 'em_andamento' | 'encerrado';

export function classifyPedidoAttention(o: Pick<Opportunity, 'status'>): PedidoAttentionGroup {
  if (o.status === 'aberta') return 'precisa_de_voce';
  if (o.status === 'cancelada' || o.status === 'booker_selecionado') return 'encerrado';
  return 'em_andamento';
}

export const PEDIDO_STATUS_LABEL: Record<Opportunity['status'], string> = {
  rascunho: 'Em andamento',
  aberta: 'Aguardando você',
  em_distribuicao: 'Em andamento',
  interesse_recebido: 'Em andamento',
  booker_selecionado: 'Encerrado',
  cancelada: 'Cancelado',
};

export function pedidoStatusTone(o: Pick<Opportunity, 'status'>): ProPillTone {
  if (o.status === 'aberta') return 'red';
  if (o.status === 'booker_selecionado') return 'green';
  if (o.status === 'cancelada') return 'neutral';
  return 'amber';
}

