import { getExternalParticipants, listConversationOperationalFacts } from '@/lib/conversations/data';
import type { RawActionableDecisionPageRow, RawResolvedDecisionPageRow } from '@/lib/decisions/data';
import type { Profile } from '@/lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getUserBookings, type BookingWithOtherParty } from '../data';
import { formatRelativeTime } from '../pro-format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type PendingCard = {
  id: string;
  heading: string;
  counterpartName: string;
  eventDateLabel: string | null;
  preparedContent: string | null;
  ctaLabel: string;
  timeLabel: string;
  createdAtIso: string;
  href: string;
};

export type ResolvedCard = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  resolvedAtIso: string;
  href: string;
};

// Extraído de decisoes/page.tsx (07/09/2026) — precisa ser reusável
// tanto pelo carregamento inicial (Server Component) quanto pelo
// "Carregar mais" (Server Action, mesma formatação, nunca uma segunda
// versão divergente).
export function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  const known: Record<string, string> = {
    professional_not_operationally_ready: 'Precisa confirmar alguns dados antes da Doopla continuar por você.',
  };
  return known[reason] ?? 'A Doopla pausou aqui e precisa de você pra seguir.';
}

export function conversationHref(relatedBookingId: string | null, conversationId: string): string {
  return relatedBookingId ? `/dashboard/bookings/${relatedBookingId}/conversa/${conversationId}` : `/dashboard/conversas/${conversationId}`;
}

function pendingReplyOutcomeLabel(status: string | null, supersededById: string | null): string {
  if (status === 'completed') return 'Você respondeu e a Doopla retomou a conversa.';
  if (supersededById) return 'Substituída por uma decisão mais recente na mesma conversa.';
  return 'Encerrada — a negociação nesta conversa chegou ao fim.';
}

function preparedDraftOutcomeLabel(outcome: string | null): string {
  if (outcome === 'edited') return 'Você editou o rascunho da Doopla antes de enviar.';
  return 'Você aprovou e enviou o rascunho da Doopla.';
}

// Resolve nome do cliente (booking se existir, senão external_participants
// via conversation_operational_facts) pras conversas desta página — nunca
// inventado, mesma fonte real de sempre. Escopado por conversationIds pra
// não precisar buscar todo o histórico de conversas do profissional a
// cada "Carregar mais".
async function buildCounterpartNameResolver(
  supabase: AnySupabaseClient,
  userId: string,
  role: Profile['role'],
  conversationIds: string[],
  bookingIdsNeeded: string[]
): Promise<{
  bookingById: Map<string, BookingWithOtherParty>;
  counterpartName: (relatedBookingId: string | null, conversationId: string) => string;
}> {
  const [bookings, conversationFacts] = await Promise.all([
    getUserBookings(userId, role, supabase),
    listConversationOperationalFacts(supabase),
  ]);
  const bookingById = new Map(bookings.filter((b) => bookingIdsNeeded.includes(b.id)).map((b) => [b.id, b]));
  const externalParticipantIdByConversationId = new Map(conversationFacts.map((f) => [f.conversationId, f.externalParticipantId]));

  const participantIdsNeeded = conversationIds
    .map((id) => externalParticipantIdByConversationId.get(id))
    .filter((id): id is string => Boolean(id));
  const participantsById = await getExternalParticipants(supabase, participantIdsNeeded);

  function counterpartName(relatedBookingId: string | null, conversationId: string): string {
    if (relatedBookingId) return bookingById.get(relatedBookingId)?.otherPartyName ?? 'Cliente';
    const participantId = externalParticipantIdByConversationId.get(conversationId);
    const participant = participantId ? participantsById.get(participantId) : undefined;
    return participant?.name ?? 'Cliente';
  }

  return { bookingById, counterpartName };
}

export async function formatPendingCards(
  supabase: AnySupabaseClient,
  userId: string,
  role: Profile['role'],
  rows: RawActionableDecisionPageRow[]
): Promise<PendingCard[]> {
  const bookingIdsNeeded = rows.map((r) => r.related_booking_id).filter((id): id is string => Boolean(id));
  const { bookingById, counterpartName } = await buildCounterpartNameResolver(
    supabase,
    userId,
    role,
    rows.map((r) => r.conversation_id),
    bookingIdsNeeded
  );

  return rows.map((r) => {
    const booking = r.related_booking_id ? bookingById.get(r.related_booking_id) : undefined;
    return {
      id: r.id,
      heading: r.kind === 'prepared_draft' ? 'Resposta pronta pra revisar' : decisionBlockReasonLabel(r.block_reason),
      counterpartName: counterpartName(r.related_booking_id, r.conversation_id),
      eventDateLabel: booking?.event_date ? new Date(`${booking.event_date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null,
      preparedContent: r.kind === 'prepared_draft' ? r.prepared_content : null,
      ctaLabel: r.kind === 'prepared_draft' ? 'Revisar e enviar' : 'Resolver',
      timeLabel: formatRelativeTime(r.created_at),
      createdAtIso: r.created_at,
      href: conversationHref(r.related_booking_id, r.conversation_id),
    };
  });
}

export async function formatResolvedCards(
  supabase: AnySupabaseClient,
  userId: string,
  role: Profile['role'],
  rows: RawResolvedDecisionPageRow[]
): Promise<ResolvedCard[]> {
  const bookingIdsNeeded = rows.map((r) => r.related_booking_id).filter((id): id is string => Boolean(id));
  const { counterpartName } = await buildCounterpartNameResolver(
    supabase,
    userId,
    role,
    rows.map((r) => r.conversation_id),
    bookingIdsNeeded
  );

  return rows.map((r) => ({
    id: r.id,
    title: counterpartName(r.related_booking_id, r.conversation_id),
    description: r.source === 'prepared_draft' ? preparedDraftOutcomeLabel(r.prepared_response_outcome) : pendingReplyOutcomeLabel(r.status, r.superseded_by_id),
    timeLabel: formatRelativeTime(r.resolved_at),
    resolvedAtIso: r.resolved_at,
    href: conversationHref(r.related_booking_id, r.conversation_id),
  }));
}
