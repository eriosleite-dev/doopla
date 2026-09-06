import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { groupDecisionsByConversation, listResolvedDecisions, sortDecisionsByPriority } from '@/lib/decisions/data';

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
// Rodada de correção/consistência (06/09/2026) — item 3: adicionada a
// visão "Resolvidas" (listResolvedDecisions, lib/decisions/data.ts),
// como aba separada da "Precisa de você", nunca um dropdown
// Pendente/Resolvida escondendo a separação. Itens resolvidos são
// compactos e não-acionáveis (sem CTA de aprovar/rejeitar).
function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  const known: Record<string, string> = {
    professional_not_operationally_ready: 'Precisa confirmar alguns dados antes da Doopla continuar por você.',
  };
  return known[reason] ?? 'A Doopla pausou aqui e precisa de você pra seguir.';
}

export default async function DecisoesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role === 'booker') redirect('/dashboard');

  const [decisions, resolvedDecisions, bookings] = await Promise.all([
    getCachedActionableDecisions(supabase),
    listResolvedDecisions(supabase),
    getUserBookings(user.id, profile.role, supabase),
  ]);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const grouped = sortDecisionsByPriority(groupDecisionsByConversation(decisions));

  const pendingCards = grouped.map((d) => {
    const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
    const href = d.relatedBookingId
      ? `/dashboard/bookings/${d.relatedBookingId}/conversa/${d.conversationId}`
      : '/dashboard/trabalhos';
    return {
      id: d.id,
      title: booking?.otherPartyName ?? 'Conversa em andamento',
      description: d.kind === 'prepared_draft' ? 'A Doopla preparou uma resposta. Revise antes de enviar.' : decisionBlockReasonLabel(d.blockReason),
      preparedContent: d.kind === 'prepared_draft' ? d.preparedContent : null,
      timeLabel: formatRelativeTime(d.createdAt),
      href,
    };
  });

  const resolvedCards = resolvedDecisions.map((r) => {
    const booking = r.relatedBookingId ? bookingById.get(r.relatedBookingId) : undefined;
    const href = r.relatedBookingId
      ? `/dashboard/bookings/${r.relatedBookingId}/conversa/${r.conversationId}`
      : '/dashboard/trabalhos';
    return {
      id: r.id,
      title: booking?.otherPartyName ?? 'Conversa',
      description: r.outcomeLabel,
      timeLabel: formatRelativeTime(r.resolvedAt),
      href,
    };
  });

  return (
    <main>
      <ProPageHeader
        title="Decisões"
        subtitle="Tudo que a Doopla está esperando você decidir — e o que já foi decidido — em cada conversa."
      />

      <ProDecisoesView pendingCount={grouped.length} pendingCards={pendingCards} resolvedCards={resolvedCards} />
    </main>
  );
}
