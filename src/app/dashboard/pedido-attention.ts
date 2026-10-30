import type { Opportunity } from '@/lib/supabase/types';

import type { ProPillTone } from './pro-format';

// Pedidos = solicitações recebidas pelo link de booking/orçamento,
// ainda em negociação — distinto de Bookings, que já avançaram pra um
// trabalho fechado (correção 15/09/2026, achado da fundadora).
//
// Labels/tons só pros estados TERMINAIS do próprio opportunity
// (cancelada/booker_selecionado) — enquanto o pedido está aberto
// ("aberta" e os estados legados de distribuição), "precisa de você"
// nunca vem daqui: vem do estado operacional real da conversation/
// decision vinculada (resolveDooplaIntervention, doopla-intervention.ts).
// Um `PEDIDO_STATUS_LABEL.aberta` chegou a existir aqui e dizia
// "Aguardando você" incondicionalmente — removido de propósito
// (achado da fundadora, 15/09/2026): nunca inferir "precisa de você" só
// de o pedido ter chegado pelo link.
export const PEDIDO_STATUS_LABEL: Partial<Record<Opportunity['status'], string>> = {
  booker_selecionado: 'Encerrado',
  cancelada: 'Cancelado',
};

export function pedidoStatusTone(o: Pick<Opportunity, 'status'>): ProPillTone {
  if (o.status === 'booker_selecionado') return 'green';
  if (o.status === 'cancelada') return 'neutral';
  return 'amber';
}
