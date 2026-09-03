import { supabase } from '@/lib/supabase';
import type { Booking, BookingEvent, BookingStatus } from '@/types/booking';

// Labels portados 1:1 de src/app/dashboard/ui.ts (STATUS_LABELS) —
// mesma linguagem de produto já usada no painel web, sem inventar
// termo novo nem alterar o valor gravado no banco.
export const STATUS_LABELS: Record<BookingStatus, string> = {
  proposta_enviada: 'Aguardando resposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
  aguardando_pagamento: 'Aguardando pagamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

// Chip de filtro da lista mobile — mapeamento de apresentação sobre o
// status real (nunca grava nada, nunca altera o enum do banco).
// "Precisa de você": proposta_enviada onde o profissional NÃO foi
// quem propôs (precisa responder). "Em negociação": proposta_enviada
// onde o profissional foi quem propôs (aguardando a outra parte).
export type BookingChip = 'precisa_de_voce' | 'em_negociacao' | 'confirmados' | 'concluidos' | 'cancelados';

export function classifyBookingForChip(booking: Booking, viewerId: string): BookingChip {
  if (booking.status === 'proposta_enviada') {
    return booking.proposed_by !== undefined && wasProposedByViewer(booking, viewerId)
      ? 'em_negociacao'
      : 'precisa_de_voce';
  }
  if (booking.status === 'aceita' || booking.status === 'aguardando_pagamento') return 'confirmados';
  if (booking.status === 'concluida') return 'concluidos';
  return 'cancelados'; // recusada | cancelada
}

// proposed_by é o ROLE de quem propôs ('artista'/'booker'/'agencia'),
// não um profile_id — nas duas colunas de participante (artist/booker)
// só uma bate com o role de quem propôs; usamos isso pra saber se foi
// o viewer atual (sempre o artista nesta fase do app).
function wasProposedByViewer(booking: Booking, viewerId: string): boolean {
  if (booking.proposed_by === 'artista') return booking.artist_profile_id === viewerId;
  return booking.booker_profile_id === viewerId;
}

export type BookingWithOtherParty = Booking & { otherPartyName: string };

export async function fetchUserBookings(viewerId: string): Promise<BookingWithOtherParty[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .or(`artist_profile_id.eq.${viewerId},booker_profile_id.eq.${viewerId}`)
    .order('updated_at', { ascending: false })
    .returns<Booking[]>();
  if (error) throw error;

  return attachOtherPartyNames(data ?? [], viewerId);
}

export async function fetchBookingDetail(bookingId: string): Promise<BookingWithOtherParty | null> {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle<Booking>();
  if (error) throw error;
  if (!data) return null;
  const [withName] = await attachOtherPartyNames([data], data.artist_profile_id);
  return withName;
}

export async function fetchBookingEvents(bookingId: string): Promise<BookingEvent[]> {
  const { data, error } = await supabase
    .from('booking_events')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .returns<BookingEvent[]>();
  if (error) throw error;
  return data ?? [];
}

async function attachOtherPartyNames(bookings: Booking[], viewerId: string): Promise<BookingWithOtherParty[]> {
  if (bookings.length === 0) return [];
  const otherIds = [...new Set(bookings.map((b) => (b.artist_profile_id === viewerId ? b.booker_profile_id : b.artist_profile_id)))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', otherIds);
  const nameById = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  return bookings.map((b) => ({
    ...b,
    otherPartyName: nameById.get(b.artist_profile_id === viewerId ? b.booker_profile_id : b.artist_profile_id) ?? 'Alguém',
  }));
}

// Portado 1:1 de src/app/dashboard/data.ts (getBookingCheckpoints) —
// função pura, mesmo algoritmo, nenhuma regra nova.
export type Checkpoint = { key: string; label: string; done: boolean };

export function getBookingCheckpoints(booking: Booking): Checkpoint[] {
  return [
    { key: 'cliente', label: 'Cliente', done: booking.status !== 'proposta_enviada' && booking.status !== 'recusada' },
    { key: 'cache', label: 'Cachê', done: booking.cache_amount_cents != null },
    { key: 'data', label: 'Data', done: booking.event_date != null },
    { key: 'validado', label: 'Validado', done: booking.validated_at != null },
    { key: 'pagamento', label: 'Pagamento', done: booking.status === 'concluida' },
  ];
}

// Portado 1:1 de src/app/dashboard/data.ts (computeArtistStats) —
// função pura sobre dados já buscados via RLS, mesmo cálculo do
// painel web, escopada a artista (única role do app mobile nesta
// fase).
export type ArtistStats = {
  totalGrossCents: number;
  netReceivedCents: number;
  availableToWithdrawCents: number;
  monthNetReceivedCents: number;
  closedCount: number;
  activeCount: number;
  awaitingPaymentCount: number;
  avgCommissionPercent: number;
};

function commissionCents(b: Booking): number {
  return Math.round(((b.cache_amount_cents ?? 0) * b.commission_percent) / 100);
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export function computeArtistStats(bookings: Booking[]): ArtistStats {
  const confirmed = bookings.filter((b) => ['aceita', 'aguardando_pagamento', 'concluida'].includes(b.status));
  const totalGrossCents = confirmed.reduce((sum, b) => sum + (b.cache_amount_cents ?? 0), 0);

  const concluded = bookings.filter((b) => b.status === 'concluida');
  const netOf = (b: Booking) => (b.cache_amount_cents ?? 0) - commissionCents(b);

  const netReceivedCents = concluded.reduce((sum, b) => sum + netOf(b), 0);
  const monthNetReceivedCents = concluded.filter((b) => isThisMonth(b.updated_at)).reduce((sum, b) => sum + netOf(b), 0);

  const activeCount = bookings.filter((b) => ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status)).length;
  const awaitingPaymentCount = bookings.filter((b) => b.status === 'aguardando_pagamento').length;

  const recent = [...concluded].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const avgCommissionPercent =
    recent.length > 0 ? recent.reduce((sum, b) => sum + Number(b.commission_percent), 0) / recent.length : 0;

  return {
    totalGrossCents,
    netReceivedCents,
    availableToWithdrawCents: netReceivedCents,
    monthNetReceivedCents,
    closedCount: concluded.length,
    activeCount,
    awaitingPaymentCount,
    avgCommissionPercent,
  };
}

export const BOOKING_EVENT_LABELS: Record<string, string> = {
  proposta_enviada: 'Proposta enviada',
  contraproposta: 'Contraproposta enviada',
  aceita: 'Proposta aceita',
  recusada: 'Proposta recusada',
  aguardando_pagamento: 'Marcado como realizado — aguardando pagamento',
  pagamento_confirmado: 'Pagamento confirmado',
  concluida: 'Booking concluído',
};
