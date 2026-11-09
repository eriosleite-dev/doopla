import type { Booking } from '@/lib/supabase/types';

// Classificação de "quem precisa agir" num booking — espelha
// classifyBookingForChip/wasProposedByViewer de
// mobile/src/lib/data/bookings.ts (Bloco 7 P1, item "Divergência
// Web×App", 09/09/2026). Web e App usam a MESMA regra: "precisa de
// você" só quando a proposta pendente foi feita pela OUTRA parte —
// nunca todo proposta_enviada, senão uma proposta que o próprio
// profissional enviou (aguardando o cliente responder) apareceria
// como se exigisse ação dele. Nunca altera booking.status (enum real
// do banco) — isto é só uma leitura derivada.
export type BookingAttentionGroup = 'precisa_de_voce' | 'em_negociacao' | 'confirmados' | 'concluidos' | 'cancelados';

export type BookingProposalFields = Pick<Booking, 'status' | 'proposed_by' | 'artist_profile_id' | 'booker_profile_id'>;

// proposed_by é o ROLE de quem propôs ('artista'/'booker'/'agencia'),
// não um profile_id — comparamos com a coluna de participante
// correspondente pra saber se foi o viewer atual quem propôs.
export function wasBookingProposedByViewer(booking: BookingProposalFields, viewerId: string): boolean {
  if (booking.proposed_by === 'artista') return booking.artist_profile_id === viewerId;
  return booking.booker_profile_id === viewerId;
}

export function classifyBookingAttention(booking: BookingProposalFields, viewerId: string): BookingAttentionGroup {
  if (booking.status === 'proposta_enviada') {
    return wasBookingProposedByViewer(booking, viewerId) ? 'em_negociacao' : 'precisa_de_voce';
  }
  if (booking.status === 'aceita' || booking.status === 'aguardando_pagamento') return 'confirmados';
  if (booking.status === 'concluida') return 'concluidos';
  return 'cancelados'; // recusada | cancelada — mesmo grupo de filtro, cor/label continuam distintas (bookingStatusTone/STATUS_LABELS)
}

export const BOOKING_ATTENTION_FILTERS: { value: BookingAttentionGroup | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'precisa_de_voce', label: 'Precisa de você' },
  { value: 'em_negociacao', label: 'Em negociação' },
  { value: 'confirmados', label: 'Confirmados' },
  { value: 'concluidos', label: 'Concluídos' },
  { value: 'cancelados', label: 'Cancelados' },
];
