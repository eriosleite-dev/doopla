import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { groupDecisionsByConversation, listResolvedDecisions, sortDecisionsByPriority } from '@/lib/decisions/data';
import { getExternalParticipants, listConversationOperationalFacts } from '@/lib/conversations/data';

import { getUserBookings } from '../data';
import { getCachedActionableDecisions } from '../pro-home-cache';
import { formatRelativeTime } from '../pro-format';
import { ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { ProDecisoesView } from './pro-decisoes-view';

export const metadata: Metadata = {
  title: 'Decisões | Doopla',
};

// Item 9 da revisão Professional Web Dashboard (06/09/2026) — lista
// completa do que a Home resume em "Precisa de você" (mesma fonte:
// getCachedActionableDecisions, agrupada por conversa pela mesma função
// usada na Home — nunca uma segunda contagem). Esta tela só REPRESENTA
// o que Runtime/Approval Engine/Policy Gate já decidiram — nunca
// contorna ou reinterpreta essa camada.
//
// Correção de UX (06/09/2026), depois de inspeção pedida explicitamente
// antes de codar:
//   1) "Ver conversa"/"Resolver" caía em /dashboard/trabalhos (lista
//      genérica) sempre que a conversa não tinha related_booking_id —
//      confirmado que isso acontece de verdade (conversa pode existir
//      antes de qualquer booking formal). A ÚNICA rota de conversa
//      exigia um bookingId na URL, mas nunca o lia (confirmado lendo o
//      componente). Corrigido com uma rota nova
//      (/dashboard/conversas/[conversationId], mesmo ConversaView,
//      zero lógica paralela) só pra esse caso — nunca mais cai no
//      fallback genérico.
//   2) Card liderava com "Conversa em andamento" (texto genérico) —
//      trocado pra liderar com O QUE PRECISA SER DECIDIDO
//      (decisionBlockReasonLabel/rótulo do tipo), nome do
//      cliente/contexto como informação secundária. Nome do cliente
//      resolvido via listConversationOperationalFacts +
//      getExternalParticipants (mesma fonte real, nunca inventado) pras
//      conversas sem booking, que antes não tinham nome nenhum
//      disponível.
function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  const known: Record<string, string> = {
    professional_not_operationally_ready: 'Precisa confirmar alguns dados antes da Doopla continuar por você.',
  };
  return known[reason] ?? 'A Doopla pausou aqui e precisa de você pra seguir.';
}

function conversationHref(relatedBookingId: string | null, conversationId: string): string {
  return relatedBookingId ? `/dashboard/bookings/${relatedBookingId}/conversa/${conversationId}` : `/dashboard/conversas/${conversationId}`;
}

export default async function DecisoesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role === 'booker') redirect('/dashboard');

  const [decisions, resolvedDecisions, bookings, conversationFacts] = await Promise.all([
    getCachedActionableDecisions(supabase),
    listResolvedDecisions(supabase),
    getUserBookings(user.id, profile.role, supabase),
    listConversationOperationalFacts(supabase),
  ]);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const externalParticipantIdByConversationId = new Map(conversationFacts.map((f) => [f.conversationId, f.externalParticipantId]));
  const grouped = sortDecisionsByPriority(groupDecisionsByConversation(decisions));

  // Nome do cliente só precisa ser resolvido "na mão" (via
  // external_participants) quando não existe booking pra pegar
  // otherPartyName de graça — nunca duplicando a fonte quando ela já
  // existe.
  const conversationIdsNeedingParticipantName = [...grouped, ...resolvedDecisions]
    .filter((d) => !d.relatedBookingId)
    .map((d) => d.conversationId);
  const participantIdsNeeded = conversationIdsNeedingParticipantName
    .map((id) => externalParticipantIdByConversationId.get(id))
    .filter((id): id is string => Boolean(id));
  const participantsById = await getExternalParticipants(supabase, participantIdsNeeded);

  function counterpartName(relatedBookingId: string | null, conversationId: string): string {
    if (relatedBookingId) return bookingById.get(relatedBookingId)?.otherPartyName ?? 'Cliente';
    const participantId = externalParticipantIdByConversationId.get(conversationId);
    const participant = participantId ? participantsById.get(participantId) : undefined;
    return participant?.name ?? 'Cliente';
  }

  const pendingCards = grouped.map((d) => {
    const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
    return {
      id: d.id,
      heading: d.kind === 'prepared_draft' ? 'Resposta pronta pra revisar' : decisionBlockReasonLabel(d.blockReason),
      counterpartName: counterpartName(d.relatedBookingId, d.conversationId),
      eventDateLabel: booking?.event_date ? new Date(`${booking.event_date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null,
      preparedContent: d.kind === 'prepared_draft' ? d.preparedContent : null,
      ctaLabel: d.kind === 'prepared_draft' ? 'Revisar e enviar' : 'Resolver',
      timeLabel: formatRelativeTime(d.createdAt),
      createdAtIso: d.createdAt,
      href: conversationHref(d.relatedBookingId, d.conversationId),
    };
  });

  const resolvedCards = resolvedDecisions.map((r) => ({
    id: r.id,
    title: counterpartName(r.relatedBookingId, r.conversationId),
    description: r.outcomeLabel,
    timeLabel: formatRelativeTime(r.resolvedAt),
    resolvedAtIso: r.resolvedAt,
    href: conversationHref(r.relatedBookingId, r.conversationId),
  }));

  return (
    <main>
      <ProPageHeader
        title="Decisões"
        subtitle="O que precisa da sua decisão e o que você já resolveu."
      />

      <ProDecisoesView pendingCount={grouped.length} pendingCards={pendingCards} resolvedCards={resolvedCards} />
    </main>
  );
}
