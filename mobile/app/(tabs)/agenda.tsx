import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radii } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons/Icons';
import { MonthCalendar } from '@/components/agenda/MonthCalendar';
import { AddAgendaEntrySheet } from '@/components/agenda/AddAgendaEntrySheet';
import { AGENDA_ENTRY_TYPE_LABELS, buildAgendaEvents, createAgendaEntry, deleteAgendaEntry, fetchArtistAgendaEntries } from '@/lib/data/agenda';
import { fetchUserBookings } from '@/lib/data/bookings';
import { formatDatePt } from '@/lib/format';
import type { AgendaEntry, AgendaEntryType, AgendaEvent } from '@/types/agenda';

type Phase = 'loading' | 'ready' | 'error';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendaScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AgendaEntry | null>(null);

  const load = useCallback(() => {
    if (!professionalId) return;
    setPhase('loading');
    Promise.all([fetchUserBookings(professionalId), fetchArtistAgendaEntries(professionalId)])
      .then(([bookings, agendaEntries]) => {
        setEntries(agendaEntries);
        setEvents(buildAgendaEvents(bookings, agendaEntries));
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [professionalId]);

  useEffect(() => {
    load();
  }, [load]);

  const datesWithActivity = useMemo(() => new Set(events.map((e) => e.date)), [events]);
  const dayEvents = useMemo(() => events.filter((e) => e.date === selectedDate), [events, selectedDate]);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  function changeMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function handleEventPress(event: AgendaEvent) {
    if (event.bookingId) {
      router.push(`/(tabs)/bookings/${event.bookingId}`);
      return;
    }
    if (event.agendaEntryId) {
      const entry = entries.find((e) => e.id === event.agendaEntryId);
      if (entry) setSelectedEntry(entry);
    }
  }

  function handleAddSubmit(params: { entryType: AgendaEntryType; startDate: string; endDate: string; note: string }) {
    if (!professionalId) return;
    if (!params.startDate || !params.endDate) {
      setFormError('Preencha ao menos o tipo e a data.');
      return;
    }
    if (params.endDate < params.startDate) {
      setFormError('A data final não pode ser antes da inicial.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    createAgendaEntry({
      artistProfileId: professionalId,
      entryType: params.entryType,
      startDate: params.startDate,
      endDate: params.endDate,
      note: params.note || null,
    })
      .then(() => {
        setSubmitting(false);
        setAddSheetOpen(false);
        load();
      })
      .catch(() => {
        setSubmitting(false);
        setFormError('Não foi possível salvar — confira se você tem acesso a essa agenda.');
      });
  }

  function handleDeleteEntry() {
    if (!selectedEntry) return;
    deleteAgendaEntry(selectedEntry.id).then(() => {
      setSelectedEntry(null);
      load();
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Agenda</Text>
        <Pressable style={styles.addBtn} onPress={() => setAddSheetOpen(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      {phase === 'loading' && <LoadingState label="Carregando agenda…" />}
      {phase === 'error' && <ErrorState message="Não conseguimos carregar sua agenda agora." onRetry={load} />}

      {phase === 'ready' && (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => changeMonth(-1)} hitSlop={8}>
              <ChevronLeftIcon size={18} color={colors.off} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable onPress={() => changeMonth(1)} hitSlop={8}>
              <ChevronRightIcon size={18} color={colors.off} />
            </Pressable>
          </View>

          <MonthCalendar
            year={cursor.year}
            month={cursor.month}
            selectedDate={selectedDate}
            datesWithActivity={datesWithActivity}
            onSelectDate={setSelectedDate}
          />

          <View style={styles.dayList}>
            <Text style={styles.dayListTitle}>{formatDatePt(selectedDate)}</Text>
            {dayEvents.length === 0 && <EmptyState title="Nada marcado para este dia." />}
            {dayEvents.map((event, i) => (
              <Pressable
                key={`${event.date}-${event.bookingId ?? event.agendaEntryId}-${i}`}
                style={[styles.eventRow, i > 0 && styles.eventBordered]}
                onPress={() => handleEventPress(event)}
              >
                <View style={[styles.eventDot, event.kind === 'confirmado' ? styles.dotConfirmado : styles.dotEntry]} />
                <View style={styles.eventTextWrap}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {event.sub && <Text style={styles.eventSub}>{event.sub}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      <BottomSheet visible={addSheetOpen} onClose={() => setAddSheetOpen(false)}>
        <AddAgendaEntrySheet initialDate={selectedDate} submitting={submitting} errorMessage={formError} onSubmit={handleAddSubmit} />
      </BottomSheet>

      <BottomSheet visible={selectedEntry !== null} onClose={() => setSelectedEntry(null)}>
        {selectedEntry && (
          <View>
            <Text style={styles.entryTitle}>{AGENDA_ENTRY_TYPE_LABELS[selectedEntry.entry_type]}</Text>
            <Text style={styles.entryMeta}>
              {formatDatePt(selectedEntry.start_date)}
              {selectedEntry.end_date !== selectedEntry.start_date ? ` — ${formatDatePt(selectedEntry.end_date)}` : ''}
            </Text>
            {selectedEntry.note && <Text style={styles.entryNote}>{selectedEntry.note}</Text>}
            <Pressable style={styles.deleteBtn} onPress={handleDeleteEntry}>
              <Text style={styles.deleteBtnText}>Remover</Text>
            </Pressable>
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 21,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 18,
    marginTop: -2,
  },
  body: {
    padding: 16,
    paddingBottom: 32,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monthLabel: {
    color: colors.off,
    fontFamily: fonts.subSemiBold,
    fontSize: 14,
    textTransform: 'capitalize',
  },
  dayList: {
    marginTop: 20,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
  },
  dayListTitle: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  eventBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  dotConfirmado: {
    backgroundColor: colors.green,
  },
  dotEntry: {
    backgroundColor: colors.amber,
  },
  eventTextWrap: {
    flex: 1,
  },
  eventTitle: {
    color: colors.off,
    fontFamily: fonts.subSemiBold,
    fontSize: 12.5,
  },
  eventSub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
    marginTop: 2,
  },
  entryTitle: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 15,
  },
  entryMeta: {
    color: colors.tx50,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 4,
  },
  entryNote: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 12.5,
    marginTop: 12,
  },
  deleteBtn: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,41,28,.4)',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#ff8b80',
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
});
