import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getConversationIdForBooking, getConversationOperationalFacts } from '@/lib/conversations/data';

import { getBookingCheckpoints, getBookingDetail, getBookingReviews } from '../../data';
import { getSessionProfile } from '../../session';
import { LegacyBookingDetailView } from './legacy-booking-detail-view';
import { ProBookingDetailView } from './pro-booking-detail-view';

export const metadata: Metadata = {
  title: 'Negociação | Doopla',
};

// Re-skin do Booking Detail (Bloco 7, P1 — 08/09/2026): page.tsx só
// busca os dados (idêntico ao original) e escolhe a view por role,
// mesmo padrão já usado em trabalhos/agenda/dinheiro (`role ===
// 'booker'` → tema legado intocado; artista/agência → tema --pro-*
// novo). Zero mudança na busca de dados/lógica de negócio — só a
// escolha de qual componente visual renderiza o resultado.
export default async function BookingDetailPage(
  props: PageProps<'/dashboard/bookings/[id]'>
) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();

  const detail = await getBookingDetail(id, user.id, profile.role, supabase);
  if (!detail) notFound();

  const { booking, events, isProposer } = detail;
  const checkpoints = getBookingCheckpoints(booking);
  const hasActiveCheckpoints = !['proposta_enviada', 'recusada', 'cancelada'].includes(booking.status);
  const reviews =
    booking.status === 'concluida'
      ? await getBookingReviews(booking.id, user.id, supabase)
      : null;

  // Conversas Bloco 2 — "Ver conversa" só existe pra quem a Doopla
  // representa (represented_professional_id É sempre o artista, nunca
  // o booker): um booker olhando este mesmo booking nunca tem
  // conversation nenhuma sua aqui, RLS devolveria vazio de qualquer
  // forma, mas a checagem de role evita a query à toa.
  const conversationId =
    profile.role === 'artista' && booking.artist_profile_id === user.id
      ? await getConversationIdForBooking(supabase, booking.id, user.id)
      : null;
  const conversationFacts = conversationId ? await getConversationOperationalFacts(supabase, conversationId) : null;

  const viewProps = {
    booking,
    events,
    isProposer,
    checkpoints,
    hasActiveCheckpoints,
    reviews,
    conversationId,
    conversationFacts,
    role: profile.role,
    userId: user.id,
  };

  if (profile.role === 'booker') {
    return <LegacyBookingDetailView {...viewProps} />;
  }
  return <ProBookingDetailView {...viewProps} />;
}
