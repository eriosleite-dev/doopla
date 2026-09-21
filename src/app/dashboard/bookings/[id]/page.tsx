import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getBookingCheckpoints, getBookingDetail, getBookingReviews } from '../../data';
import { getSessionProfile } from '../../session';
import { LegacyBookingDetailView } from './legacy-booking-detail-view';
import { ProBookingDetailView } from './pro-booking-detail-view';

// Título genérico (não mais "Negociação | Doopla") — Direct Booking
// nunca é uma negociação (nasce já aceito), e o título estático da
// aba não tem acesso ao booking pra decidir dinamicamente sem uma
// segunda consulta só pra isso.
export const metadata: Metadata = {
  title: 'Booking | Doopla',
};

// Re-skin do Booking Detail (Bloco 7, P1 — 08/09/2026): page.tsx só
// busca os dados (idêntico ao original) e escolhe a view por role,
// mesmo padrão já usado em trabalhos/agenda/dinheiro (`role ===
// 'booker'` → tema legado intocado; artista/agência → tema --pro-*
// novo). Zero mudança na busca de dados/lógica de negócio — só a
// escolha de qual componente visual renderiza o resultado.
//
// PENDING INTEGRATION — booking ↔ conversation (auditoria 15/09/2026,
// mesma nota em pro-booking-detail-view.tsx). A busca de
// conversationId/conversationFacts foi removida daqui: já era gatilhada
// só pra role='artista' dono do booking, e `getConversationIdForBooking`
// sempre retornava null na prática (`conversations.related_booking_id`
// nunca é escrito com um valor real em nenhum caminho de código atual
// — só limpo pra null, migration 0051). Booker (LegacyBookingDetailView,
// intocado) já recebia sempre `conversationId: null` antes desta
// mudança — comportamento idêntico preservado abaixo, só sem a
// consulta desperdiçada. Helpers preservados intactos em
// src/lib/conversations/data.ts pra reconciliação futura.
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

  const conversationId = null;
  const conversationFacts = null;

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
