import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { FullSheetHeader } from '@/components/shared/FullSheetHeader';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import { DetailSection, DetailRow } from '@/components/shared/DetailSection';
import { formatCentsAsBRL, formatDatePt, formatDateTimePt, formatPercent } from '@/lib/format';
import {
  BOOKING_EVENT_LABELS,
  STATUS_LABELS,
  fetchBookingDetail,
  fetchBookingEvents,
  getBookingCheckpoints,
  type BookingWithOtherParty,
} from '@/lib/data/bookings';
import type { BookingEvent } from '@/types/booking';
import { fetchActiveApprovalsForBooking } from '@/lib/data/approvals';
import type { ApprovalRecord } from '@/types/approval';
import { fetchConversationIdForBooking, fetchConversationOperationalFacts } from '@/lib/data/conversations';
import { CONVERSATION_STATE_LABELS, conversationStateColor } from '@/lib/conversation-labels';
import type { ConversationOperationalFacts } from '@/types/conversation';

type Phase = 'loading' | 'ready' | 'error';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [booking, setBooking] = useState<BookingWithOtherParty | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationFacts, setConversationFacts] = useState<ConversationOperationalFacts | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setPhase('loading');
    Promise.all([fetchBookingDetail(id), fetchBookingEvents(id)])
      .then(([bookingData, eventsData]) => {
        setBooking(bookingData);
        setEvents(eventsData);
        setPhase('ready');
        if (bookingData && professionalId) {
          fetchActiveApprovalsForBooking(professionalId, id)
            .then(setApprovals)
            .catch(() => setApprovals([]));
          // "Ver conversa" só existe pra quem a Doopla representa
          // (represented_professional_id É sempre o artista) — mesma
          // checagem já feita no painel web.
          if (bookingData.artist_profile_id === professionalId) {
            fetchConversationIdForBooking(id, professionalId)
              .then((cid) => {
                setConversationId(cid);
                if (cid) fetchConversationOperationalFacts(cid).then(setConversationFacts).catch(() => setConversationFacts(null));
              })
              .catch(() => setConversationId(null));
          }
        }
      })
      .catch(() => setPhase('error'));
  }, [id, professionalId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FullSheetHeader title="Booking" onBack={() => router.back()} onClose={() => router.back()} />
      {phase === 'loading' && <LoadingState label="Carregando booking…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar esse booking agora." onRetry={load} />}
      {phase === 'ready' && !booking && <ErrorState message="Esse booking não existe ou você não tem acesso a ele." />}
      {phase === 'ready' && booking && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <DetailSection title="Status">
            <DetailRow label="Situação atual" value={STATUS_LABELS[booking.status]} />
          </DetailSection>

          {conversationId && conversationFacts && (
            <DetailSection title="Conversa">
              <Pressable style={styles.conversationRow} onPress={() => router.push(`/conversas/${conversationId}`)}>
                <View style={styles.conversationInfo}>
                  <View style={styles.conversationStateRow}>
                    <View style={[styles.conversationDot, { backgroundColor: conversationStateColor(conversationFacts.state) }]} />
                    <Text style={[styles.conversationState, { color: conversationStateColor(conversationFacts.state) }]}>
                      {CONVERSATION_STATE_LABELS[conversationFacts.state]}
                    </Text>
                  </View>
                  <Text style={styles.conversationSub}>
                    {conversationFacts.lastMessageCreatedAt ? `Última mensagem ${formatDateTimePt(conversationFacts.lastMessageCreatedAt)}` : 'Nenhuma mensagem ainda'}
                  </Text>
                </View>
                <Text style={styles.link}>Ver conversa</Text>
              </Pressable>
            </DetailSection>
          )}

          <DetailSection title="Cliente / evento">
            <DetailRow label={booking.client_name ? 'Cliente' : 'Contraparte'} value={booking.client_name ?? booking.otherPartyName} />
            {booking.description && <DetailRow label="Descrição" value={booking.description} />}
          </DetailSection>

          {(booking.event_date || booking.event_location) && (
            <DetailSection title="Data e local">
              {booking.event_date && <DetailRow label="Data" value={formatDatePt(booking.event_date)} />}
              {booking.event_location && <DetailRow label="Local" value={booking.event_location} />}
            </DetailSection>
          )}

          <DetailSection title="Condições comerciais">
            <DetailRow label="Comissão" value={formatPercent(booking.commission_percent)} />
            {booking.cache_amount_cents != null && <DetailRow label="Cachê" value={formatCentsAsBRL(booking.cache_amount_cents)} />}
          </DetailSection>

          {(booking.payment_due_at || booking.payment_mode === 'sinal_saldo' || booking.requires_invoice === 'sim') && (
            <DetailSection title="Pagamento">
              {booking.payment_mode === 'sinal_saldo' && booking.deposit_percentage != null && (
                <DetailRow label="Sinal" value={`${formatPercent(booking.deposit_percentage)} na reserva`} />
              )}
              {booking.payment_due_at && <DetailRow label="Vencimento" value={formatDatePt(booking.payment_due_at.slice(0, 10))} />}
              {booking.requires_invoice === 'sim' && (
                <>
                  <DetailRow label="Nota fiscal" value={booking.invoice_issued_at ? 'Emitida' : 'Pendente de emissão'} />
                  {booking.invoice_client_paid_at && <DetailRow label="Cliente pagou" value={formatDatePt(booking.invoice_client_paid_at.slice(0, 10))} />}
                </>
              )}
            </DetailSection>
          )}

          {booking.cancelled_at && (
            <DetailSection title="Cancelamento">
              <DetailRow label="Cancelado em" value={formatDatePt(booking.cancelled_at.slice(0, 10))} />
              {booking.cancellation_reason && <DetailRow label="Motivo" value={booking.cancellation_reason} />}
            </DetailSection>
          )}

          {booking.rescheduled_event_date && (
            <DetailSection title="Remarcação">
              <DetailRow label="Nova data" value={formatDatePt(booking.rescheduled_event_date)} />
            </DetailSection>
          )}

          {booking.contract_url && (
            <DetailSection title="Contrato">
              <Pressable onPress={() => Linking.openURL(booking.contract_url as string)}>
                <Text style={styles.link}>Ver contrato</Text>
              </Pressable>
            </DetailSection>
          )}

          {approvals.length > 0 && (
            <DetailSection title="Condições decididas">
              <Text style={styles.approvalsNote}>
                Histórico do que já foi efetivamente decidido nessa negociação — não é uma pendência aguardando ação.
              </Text>
              {approvals.map((a) => (
                <DetailRow
                  key={a.id}
                  label={a.decision_category}
                  value={a.operation_type === 'revocation' ? 'Revogado' : JSON.stringify(a.approved_value)}
                />
              ))}
            </DetailSection>
          )}

          {events.length > 0 && (
            <DetailSection title="Histórico">
              {events.map((e, i) => (
                <View key={e.id} style={[styles.historyRow, i > 0 && styles.historyBordered]}>
                  <Text style={styles.historyLabel}>{BOOKING_EVENT_LABELS[e.event_type] ?? e.event_type}</Text>
                  <Text style={styles.historyTime}>{formatDateTimePt(e.created_at)}</Text>
                </View>
              ))}
            </DetailSection>
          )}

          <Text style={styles.actionsGapNote}>
            Aceitar, recusar, cancelar, remarcar e marcar como pago ainda não estão disponíveis pelo app — use o painel web
            enquanto preparamos esse caminho com segurança.
          </Text>
          <Checkpoints booking={booking} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Checkpoints({ booking }: { booking: BookingWithOtherParty }) {
  const checkpoints = getBookingCheckpoints(booking);
  return (
    <View style={styles.checkpoints}>
      {checkpoints.map((c) => (
        <View key={c.key} style={styles.checkpoint}>
          <View style={[styles.checkpointDot, c.done ? styles.checkpointDone : styles.checkpointPending]} />
          <Text style={styles.checkpointLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  body: {
    padding: 16,
  },
  link: {
    color: colors.red,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  conversationInfo: {
    flex: 1,
    gap: 3,
  },
  conversationStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conversationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  conversationState: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  conversationSub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  approvalsNote: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  historyRow: {
    paddingVertical: 8,
  },
  historyBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  historyLabel: {
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  historyTime: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    marginTop: 2,
  },
  actionsGapNote: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  checkpoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  checkpoint: {
    alignItems: 'center',
    gap: 4,
  },
  checkpointDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  checkpointDone: {
    backgroundColor: colors.green,
  },
  checkpointPending: {
    backgroundColor: 'rgba(251,249,242,.15)',
  },
  checkpointLabel: {
    color: colors.tx50,
    fontFamily: fonts.mono,
    fontSize: 8.5,
  },
});
