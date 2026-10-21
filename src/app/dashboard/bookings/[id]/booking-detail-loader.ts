import type { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

import { getBookingCheckpoints, getBookingDetail, getBookingReviews } from '../../data';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Extraído de bookings/[id]/page.tsx (BookingDrawer, 30/09/2026) — o
// drawer lateral (@modal/(.)bookings/[id]/ver) precisa buscar
// EXATAMENTE os mesmos dados que a página completa, pra nunca duplicar
// a lógica de negócio (exigência explícita da fundadora). Esta função
// é a única fonte dessa busca — page.tsx e o drawer só chamam ela.
//
// PENDING INTEGRATION — booking ↔ conversation (auditoria 15/09/2026,
// mesma nota em page.tsx/pro-booking-detail-view.tsx): conversationId/
// conversationFacts continuam null, sem busca — comportamento idêntico
// ao que já existia antes desta extração.
export async function loadBookingDetailViewProps(
  id: string,
  userId: string,
  role: Profile['role'],
  supabase: SupabaseServerClient
) {
  const detail = await getBookingDetail(id, userId, role, supabase);
  if (!detail) return null;

  const { booking, events, isProposer } = detail;
  const checkpoints = getBookingCheckpoints(booking);
  const hasActiveCheckpoints = !['proposta_enviada', 'recusada', 'cancelada'].includes(booking.status);
  const reviews =
    booking.status === 'concluida'
      ? await getBookingReviews(booking.id, userId, supabase)
      : null;

  return {
    booking,
    events,
    isProposer,
    checkpoints,
    hasActiveCheckpoints,
    reviews,
    conversationId: null,
    conversationFacts: null,
    role,
    userId,
  };
}
