import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { fetchUserBookings, type BookingWithOtherParty } from '@/lib/data/bookings';
import { fetchConversationsList, fetchExternalParticipants } from '@/lib/data/conversations';
import {
  decisionBlockReasonLabel,
  fetchActionableDecisions,
  fetchResolvedDecisions,
  groupDecisionsByConversation,
  sortDecisionsByPriority,
  type DecisionItem,
  type ResolvedDecisionItem,
} from '@/lib/data/decisions';
import { formatDatePt } from '@/lib/format';

type Phase = 'loading' | 'ready' | 'error';
type Tab = 'pendentes' | 'resolvidas';
type PendingSort = 'prioridade' | 'recentes' | 'antigas';
type ResolvedSort = 'recentes' | 'antigas';

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
  createdAtIso: string;
  conversationId: string;
};

type ResolvedCard = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  resolvedAtIso: string;
  conversationId: string;
};

// Correção de UX de Decisões (06/09/2026) — espelha
// src/app/dashboard/decisoes (painel web): mesma fonte canônica
// (fetchActionableDecisions/fetchResolvedDecisions, agrupamento e
// prioridade de src/lib/data/decisions.ts), mesmos cards liderando com
// O QUE PRECISA SER DECIDIDO (nunca mais "Conversa em andamento"),
// mesmo split Pendentes/Resolvidas + ordenação real. Só o padrão de
// interação muda pro mobile (chips de ordenação em vez de <select>,
// tela cheia em vez de lista com abas no topo de uma página web) — a
// tela antes era um PlaceholderScreen puro, nunca existiu de verdade.
// Deep link contextual já era correto aqui (router.push(`/conversas/${id}`)
// nunca exigiu bookingId, ao contrário do bug que existia no painel web).
export default function DecisoesScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [tab, setTab] = useState<Tab>('pendentes');
  const [pendingSort, setPendingSort] = useState<PendingSort>('prioridade');
  const [resolvedSort, setResolvedSort] = useState<ResolvedSort>('recentes');
  const [retryTick, setRetryTick] = useState(0);

  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [resolvedDecisions, setResolvedDecisions] = useState<ResolvedDecisionItem[]>([]);
  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [externalParticipantIdByConversationId, setExternalParticipantIdByConversationId] = useState<Map<string, string | null>>(new Map());
  const [participantsById, setParticipantsById] = useState<Map<string, { id: string; name: string | null }>>(new Map());

  const load = useCallback(async () => {
    if (!professionalId) return;
    setPhase('loading');
    try {
      const [decisionsData, resolvedData, bookingsData, conversationFacts] = await Promise.all([
        fetchActionableDecisions(),
        fetchResolvedDecisions(),
        fetchUserBookings(professionalId),
        fetchConversationsList(),
      ]);
      setDecisions(decisionsData);
      setResolvedDecisions(resolvedData);
      setBookings(bookingsData);

      const factsByConversationId = new Map(conversationFacts.map((f) => [f.conversationId, f.externalParticipantId]));
      setExternalParticipantIdByConversationId(factsByConversationId);

      const grouped = groupDecisionsByConversation(decisionsData);
      const conversationsNeedingParticipant = [...grouped, ...resolvedData].filter((d) => !d.relatedBookingId).map((d) => d.conversationId);
      const participantIdsNeeded = conversationsNeedingParticipant
        .map((id) => factsByConversationId.get(id))
        .filter((id): id is string => Boolean(id));
      const participants = await fetchExternalParticipants(participantIdsNeeded);
      setParticipantsById(participants);

      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [professionalId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load, retryTick]);

  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const counterpartName = useCallback(
    (relatedBookingId: string | null, conversationId: string): string => {
      if (relatedBookingId) return bookingById.get(relatedBookingId)?.otherPartyName ?? 'Cliente';
      const participantId = externalParticipantIdByConversationId.get(conversationId);
      const participant = participantId ? participantsById.get(participantId) : undefined;
      return participant?.name ?? 'Cliente';
    },
    [bookingById, externalParticipantIdByConversationId, participantsById]
  );

  const grouped = useMemo(() => sortDecisionsByPriority(groupDecisionsByConversation(decisions)), [decisions]);

  const pendingCards: PendingCard[] = useMemo(
    () =>
      grouped.map((d) => {
        const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
        return {
          id: d.id,
          heading: d.kind === 'prepared_draft' ? 'Resposta pronta pra revisar' : decisionBlockReasonLabel(d.blockReason),
          counterpartName: counterpartName(d.relatedBookingId, d.conversationId),
          eventDateLabel: booking?.event_date ? formatDatePt(booking.event_date) : null,
          preparedContent: d.kind === 'prepared_draft' ? d.preparedContent : null,
          ctaLabel: d.kind === 'prepared_draft' ? 'Revisar e enviar' : 'Resolver',
          timeLabel: formatRelativeTime(d.createdAt),
          createdAtIso: d.createdAt,
          conversationId: d.conversationId,
        };
      }),
    [grouped, bookingById, counterpartName]
  );

  const resolvedCards: ResolvedCard[] = useMemo(
    () =>
      resolvedDecisions.map((r) => ({
        id: r.id,
        title: counterpartName(r.relatedBookingId, r.conversationId),
        description: r.outcomeLabel,
        timeLabel: formatRelativeTime(r.resolvedAt),
        resolvedAtIso: r.resolvedAt,
        conversationId: r.conversationId,
      })),
    [resolvedDecisions, counterpartName]
  );

  const orderedPending = useMemo(() => {
    if (pendingSort === 'prioridade') return pendingCards;
    const sorted = [...pendingCards].sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
    return pendingSort === 'recentes' ? sorted.reverse() : sorted;
  }, [pendingCards, pendingSort]);

  const orderedResolved = useMemo(() => {
    const sorted = [...resolvedCards].sort((a, b) => a.resolvedAtIso.localeCompare(b.resolvedAtIso));
    return resolvedSort === 'recentes' ? sorted.reverse() : sorted;
  }, [resolvedCards, resolvedSort]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('pendentes')} style={styles.tabBtn}>
          <Text style={[styles.tabText, tab === 'pendentes' && styles.tabTextActive]}>
            Precisa de você{pendingCards.length > 0 ? ` (${pendingCards.length})` : ''}
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
                onChange={(v) => setPendingSort(v as PendingSort)}
                options={[
                  { value: 'prioridade', label: 'Prioridade' },
                  { value: 'recentes', label: 'Recentes' },
                  { value: 'antigas', label: 'Antigas' },
                ]}
              />
              {orderedPending.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.cardHeading}>{c.heading}</Text>
                  <Text style={styles.cardMeta}>
                    {c.counterpartName}
                    {c.eventDateLabel ? ` · evento em ${c.eventDateLabel}` : ''} · {c.timeLabel}
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
                onChange={(v) => setResolvedSort(v as ResolvedSort)}
                options={[
                  { value: 'recentes', label: 'Recentes' },
                  { value: 'antigas', label: 'Antigas' },
                ]}
              />
              {orderedResolved.map((c) => (
                <Pressable key={c.id} style={styles.resolvedCard} onPress={() => router.push(`/conversas/${c.conversationId}`)}>
                  <View style={styles.resolvedHead}>
                    <Text style={styles.resolvedTitle}>{c.title}</Text>
                    <View style={styles.resolvedPill}>
                      <Text style={styles.resolvedPillText}>Resolvida por você</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>{c.description}</Text>
                  <Text style={styles.resolvedTime}>{c.timeLabel}</Text>
                </Pressable>
              ))}
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
});
