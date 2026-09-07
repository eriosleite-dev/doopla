import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { fetchUserBookings, type BookingWithOtherParty } from '@/lib/data/bookings';
import { fetchConversationsList, fetchExternalParticipants } from '@/lib/data/conversations';
import {
  decisionBlockReasonLabel,
  fetchActionableDecisionsPage,
  fetchResolvedDecisionsPage,
  type ActionableDecisionSort,
  type RawActionableDecisionPageRow,
  type RawResolvedDecisionPageRow,
  type ResolvedDecisionSort,
} from '@/lib/data/decisions';
import { formatDatePt } from '@/lib/format';

const PAGE_SIZE = 20;

type Phase = 'loading' | 'ready' | 'error';
type Tab = 'pendentes' | 'resolvidas';

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  return `Há ${Math.floor(hours / 24)}d`;
}

type PendingCard = {
  id: string;
  heading: string;
  counterpartName: string;
  eventDateLabel: string | null;
  preparedContent: string | null;
  ctaLabel: string;
  timeLabel: string;
  conversationId: string;
};

type ResolvedCard = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  conversationId: string;
};

function pendingReplyOutcomeLabel(status: string | null, supersededById: string | null): string {
  if (status === 'completed') return 'Você respondeu e a Doopla retomou a conversa.';
  if (supersededById) return 'Substituída por uma decisão mais recente na mesma conversa.';
  return 'Encerrada — a negociação nesta conversa chegou ao fim.';
}

function preparedDraftOutcomeLabel(outcome: string | null): string {
  if (outcome === 'edited') return 'Você editou o rascunho da Doopla antes de enviar.';
  return 'Você aprovou e enviou o rascunho da Doopla.';
}

// Reescrita pra paginação real server-side (migration 0070/hotfix
// pedido explicitamente) — espelha src/app/dashboard/decisoes (painel
// web): 20 primeiro, "Carregar mais" +20, sem paginação numérica, sem
// infinite scroll, contador = total real (não só o carregado),
// filtro/ordenação sempre no servidor via list_actionable_decisions_
// page/list_resolved_decisions_page (mesmas RPCs do Web — nunca uma
// query paralela). Ordem default agora é "Recentes" (decisão de
// produto já registrada — antes abria em "Prioridade" por engano,
// mesmo bug do painel web). Deep link continua sem depender de
// bookingId (já era correto aqui).
export default function DecisoesScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [tab, setTab] = useState<Tab>('pendentes');
  const [retryTick, setRetryTick] = useState(0);

  const [pendingSort, setPendingSort] = useState<ActionableDecisionSort>('recentes');
  const [pendingRows, setPendingRows] = useState<RawActionableDecisionPageRow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingLoadingMore, setPendingLoadingMore] = useState(false);

  const [resolvedSort, setResolvedSort] = useState<ResolvedDecisionSort>('recentes');
  const [resolvedRows, setResolvedRows] = useState<RawResolvedDecisionPageRow[]>([]);
  const [resolvedTotal, setResolvedTotal] = useState(0);
  const [resolvedLoadingMore, setResolvedLoadingMore] = useState(false);

  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [externalParticipantIdByConversationId, setExternalParticipantIdByConversationId] = useState<Map<string, string | null>>(new Map());
  const [participantsById, setParticipantsById] = useState<Map<string, { id: string; name: string | null }>>(new Map());

  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const ensureParticipants = useCallback(
    async (rows: { related_booking_id: string | null; conversation_id: string }[], factsMap: Map<string, string | null>, known: Map<string, { id: string; name: string | null }>) => {
      const needed = rows
        .filter((r) => !r.related_booking_id)
        .map((r) => factsMap.get(r.conversation_id))
        .filter((id): id is string => Boolean(id) && !known.has(id as string));
      if (needed.length === 0) return known;
      const fetched = await fetchExternalParticipants(needed);
      const merged = new Map(known);
      fetched.forEach((v, k) => merged.set(k, v));
      return merged;
    },
    []
  );

  const load = useCallback(async () => {
    if (!professionalId) return;
    setPhase('loading');
    try {
      const [pendingPage, resolvedPage, bookingsData, conversationFacts] = await Promise.all([
        fetchActionableDecisionsPage({ sort: 'recentes', limit: PAGE_SIZE, offset: 0 }),
        fetchResolvedDecisionsPage({ sort: 'recentes', limit: PAGE_SIZE, offset: 0 }),
        fetchUserBookings(professionalId),
        fetchConversationsList(),
      ]);
      setPendingSort('recentes');
      setResolvedSort('recentes');
      setPendingRows(pendingPage.rows);
      setPendingTotal(pendingPage.totalCount);
      setResolvedRows(resolvedPage.rows);
      setResolvedTotal(resolvedPage.totalCount);
      setBookings(bookingsData);

      const factsByConversationId = new Map(conversationFacts.map((f) => [f.conversationId, f.externalParticipantId]));
      setExternalParticipantIdByConversationId(factsByConversationId);

      const participants = await ensureParticipants([...pendingPage.rows, ...resolvedPage.rows], factsByConversationId, new Map());
      setParticipantsById(participants);

      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [professionalId, ensureParticipants]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, retryTick]);

  async function changePendingSort(sort: ActionableDecisionSort) {
    setPendingSort(sort);
    const page = await fetchActionableDecisionsPage({ sort, limit: PAGE_SIZE, offset: 0 });
    setPendingRows(page.rows);
    setPendingTotal(page.totalCount);
    const participants = await ensureParticipants(page.rows, externalParticipantIdByConversationId, participantsById);
    setParticipantsById(participants);
  }

  async function loadMorePending() {
    setPendingLoadingMore(true);
    try {
      const page = await fetchActionableDecisionsPage({ sort: pendingSort, limit: PAGE_SIZE, offset: pendingRows.length });
      setPendingRows((prev) => [...prev, ...page.rows]);
      setPendingTotal(page.totalCount);
      const participants = await ensureParticipants(page.rows, externalParticipantIdByConversationId, participantsById);
      setParticipantsById(participants);
    } finally {
      setPendingLoadingMore(false);
    }
  }

  async function changeResolvedSort(sort: ResolvedDecisionSort) {
    setResolvedSort(sort);
    const page = await fetchResolvedDecisionsPage({ sort, limit: PAGE_SIZE, offset: 0 });
    setResolvedRows(page.rows);
    setResolvedTotal(page.totalCount);
    const participants = await ensureParticipants(page.rows, externalParticipantIdByConversationId, participantsById);
    setParticipantsById(participants);
  }

  async function loadMoreResolved() {
    setResolvedLoadingMore(true);
    try {
      const page = await fetchResolvedDecisionsPage({ sort: resolvedSort, limit: PAGE_SIZE, offset: resolvedRows.length });
      setResolvedRows((prev) => [...prev, ...page.rows]);
      setResolvedTotal(page.totalCount);
      const participants = await ensureParticipants(page.rows, externalParticipantIdByConversationId, participantsById);
      setParticipantsById(participants);
    } finally {
      setResolvedLoadingMore(false);
    }
  }

  const counterpartName = useCallback(
    (relatedBookingId: string | null, conversationId: string): string => {
      if (relatedBookingId) return bookingById.get(relatedBookingId)?.otherPartyName ?? 'Cliente';
      const participantId = externalParticipantIdByConversationId.get(conversationId);
      const participant = participantId ? participantsById.get(participantId) : undefined;
      return participant?.name ?? 'Cliente';
    },
    [bookingById, externalParticipantIdByConversationId, participantsById]
  );

  const pendingCards: PendingCard[] = useMemo(
    () =>
      pendingRows.map((r) => {
        const booking = r.related_booking_id ? bookingById.get(r.related_booking_id) : undefined;
        return {
          id: r.id,
          heading: r.kind === 'prepared_draft' ? 'Resposta pronta pra revisar' : decisionBlockReasonLabel(r.block_reason),
          counterpartName: counterpartName(r.related_booking_id, r.conversation_id),
          eventDateLabel: booking?.event_date ? formatDatePt(booking.event_date) : null,
          preparedContent: r.kind === 'prepared_draft' ? r.prepared_content : null,
          ctaLabel: r.kind === 'prepared_draft' ? 'Revisar e enviar' : 'Resolver',
          timeLabel: formatRelativeTime(r.created_at),
          conversationId: r.conversation_id,
        };
      }),
    [pendingRows, bookingById, counterpartName]
  );

  const resolvedCards: ResolvedCard[] = useMemo(
    () =>
      resolvedRows.map((r) => ({
        id: r.id,
        title: counterpartName(r.related_booking_id, r.conversation_id),
        description: r.source === 'prepared_draft' ? preparedDraftOutcomeLabel(r.prepared_response_outcome) : pendingReplyOutcomeLabel(r.status, r.superseded_by_id),
        timeLabel: formatRelativeTime(r.resolved_at),
        conversationId: r.conversation_id,
      })),
    [resolvedRows, counterpartName]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('pendentes')} style={styles.tabBtn}>
          <Text style={[styles.tabText, tab === 'pendentes' && styles.tabTextActive]}>
            Precisa de você{pendingTotal > 0 ? ` (${pendingTotal})` : ''}
          </Text>
          {tab === 'pendentes' && <View style={styles.tabIndicator} />}
        </Pressable>
        <Pressable onPress={() => setTab('resolvidas')} style={styles.tabBtn}>
          <Text style={[styles.tabText, tab === 'resolvidas' && styles.tabTextActive]}>Resolvidas</Text>
          {tab === 'resolvidas' && <View style={styles.tabIndicator} />}
        </Pressable>
      </View>

      {phase === 'loading' && <LoadingState label="Carregando decisões…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar suas decisões agora." onRetry={() => setRetryTick((t) => t + 1)} />}

      {phase === 'ready' && tab === 'pendentes' && (
        <ScrollView contentContainerStyle={styles.body}>
          {pendingCards.length === 0 ? (
            <EmptyState title="Tudo resolvido por aqui" subtitle="Sua Doopla te chama quando precisar de uma decisão." />
          ) : (
            <>
              <SortChips
                value={pendingSort}
                onChange={(v) => changePendingSort(v as ActionableDecisionSort)}
                options={[
                  { value: 'recentes', label: 'Recentes' },
                  { value: 'antigas', label: 'Antigas' },
                  { value: 'prioridade', label: 'Prioridade' },
                ]}
              />
              {pendingCards.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.cardHeading}>{c.heading}</Text>
                  <Text style={styles.cardMeta}>
                    {c.counterpartName}
                    {c.eventDateLabel ? (
                      <>
                        {' · '}
                        <Text style={styles.cardMetaBold}>evento em {c.eventDateLabel}</Text>
                      </>
                    ) : null}
                    {' · '}
                    <Text style={styles.cardMetaBold}>{c.timeLabel}</Text>
                  </Text>
                  {c.preparedContent && (
                    <Text style={styles.cardExcerpt} numberOfLines={2}>
                      &ldquo;{c.preparedContent}&rdquo;
                    </Text>
                  )}
                  <Pressable style={styles.cta} onPress={() => router.push(`/conversas/${c.conversationId}`)}>
                    <Text style={styles.ctaText}>{c.ctaLabel}</Text>
                  </Pressable>
                </View>
              ))}
              {pendingCards.length < pendingTotal && (
                <Pressable style={styles.loadMore} disabled={pendingLoadingMore} onPress={loadMorePending}>
                  {pendingLoadingMore ? (
                    <ActivityIndicator color={colors.off} size="small" />
                  ) : (
                    <Text style={styles.loadMoreText}>Carregar mais ({pendingTotal - pendingCards.length})</Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      )}

      {phase === 'ready' && tab === 'resolvidas' && (
        <ScrollView contentContainerStyle={styles.body}>
          {resolvedCards.length === 0 ? (
            <EmptyState title="Nenhuma decisão resolvida ainda" />
          ) : (
            <>
              <SortChips
                value={resolvedSort}
                onChange={(v) => changeResolvedSort(v as ResolvedDecisionSort)}
                options={[
                  { value: 'recentes', label: 'Recentes' },
                  { value: 'antigas', label: 'Antigas' },
                ]}
              />
              {resolvedCards.map((c) => (
                <Pressable key={c.id} style={styles.resolvedCard} onPress={() => router.push(`/conversas/${c.conversationId}`)}>
                  <View style={styles.resolvedHead}>
                    <Text style={styles.resolvedTitle}>{c.title}</Text>
                    <View style={styles.resolvedPill}>
                      <Text style={styles.resolvedPillText}>Resolvida por você</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{c.description}</Text>
                  <Text style={[styles.resolvedTime, styles.resolvedTimeBold]}>{c.timeLabel}</Text>
                </Pressable>
              ))}
              {resolvedCards.length < resolvedTotal && (
                <Pressable style={styles.loadMore} disabled={resolvedLoadingMore} onPress={loadMoreResolved}>
                  {resolvedLoadingMore ? (
                    <ActivityIndicator color={colors.off} size="small" />
                  ) : (
                    <Text style={styles.loadMoreText}>Carregar mais ({resolvedTotal - resolvedCards.length})</Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SortChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <View style={styles.sortRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable key={opt.value} onPress={() => onChange(opt.value)} style={[styles.sortChip, active && styles.sortChipActive]}>
            <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  tabs: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tabBtn: {
    paddingVertical: 12,
  },
  tabText: {
    color: colors.tx50,
    fontFamily: fonts.subBold,
    fontSize: 13,
  },
  tabTextActive: {
    color: colors.off,
  },
  tabIndicator: {
    height: 2,
    backgroundColor: colors.red,
    marginTop: 8,
    borderRadius: 1,
  },
  body: {
    padding: 16,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  sortChipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  sortChipText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 10.5,
  },
  sortChipTextActive: {
    color: colors.off,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
  },
  cardHeading: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
    marginBottom: 5,
  },
  cardMeta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
  },
  cardMetaBold: {
    fontFamily: fonts.bodySemiBold,
  },
  cardExcerpt: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 11.5,
    marginTop: 8,
  },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.red,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },
  ctaText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12,
  },
  loadMore: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 6,
  },
  loadMoreText: {
    color: colors.tx70,
    fontFamily: fonts.subBold,
    fontSize: 12,
  },
  resolvedCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 10,
  },
  resolvedHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 5,
  },
  resolvedTitle: {
    flex: 1,
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13,
  },
  resolvedPill: {
    backgroundColor: 'rgba(62,207,110,.15)',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resolvedPillText: {
    color: colors.green,
    fontFamily: fonts.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  resolvedTime: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 8,
  },
  resolvedTimeBold: {
    fontFamily: fonts.monoBold,
  },
});
