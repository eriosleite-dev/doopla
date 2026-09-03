import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/ScreenState';
import { BookingListRow } from '@/components/bookings/BookingListRow';
import { classifyBookingForChip, fetchUserBookings, type BookingChip, type BookingWithOtherParty } from '@/lib/data/bookings';

type Phase = 'loading' | 'ready' | 'error';

const CHIPS: { key: BookingChip | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'precisa_de_voce', label: 'Precisa de você' },
  { key: 'em_negociacao', label: 'Em negociação' },
  { key: 'confirmados', label: 'Confirmados' },
  { key: 'concluidos', label: 'Concluídos' },
  { key: 'cancelados', label: 'Cancelados' },
];

export default function BookingsListScreen() {
  const router = useRouter();
  const { professionalId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [activeChip, setActiveChip] = useState<BookingChip | 'todos'>('todos');

  const load = useCallback(() => {
    if (!professionalId) return;
    setPhase('loading');
    fetchUserBookings(professionalId)
      .then((data) => {
        setBookings(data);
        setPhase('ready');
      })
      .catch(() => setPhase('error'));
  }, [professionalId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!professionalId) return [];
    if (activeChip === 'todos') return bookings;
    return bookings.filter((b) => classifyBookingForChip(b, professionalId) === activeChip);
  }, [bookings, activeChip, professionalId]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CHIPS.map((chip) => {
          const active = chip.key === activeChip;
          return (
            <Pressable key={chip.key} onPress={() => setActiveChip(chip.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {phase === 'loading' && <LoadingState label="Carregando bookings…" />}
        {phase === 'error' && <ErrorState message="Não conseguimos carregar seus bookings agora." onRetry={load} />}
        {phase === 'ready' && filtered.length === 0 && (
          <EmptyState
            title="Nenhum booking por aqui ainda."
            subtitle="Novos pedidos aparecerão aqui quando chegarem à Doopla."
          />
        )}
        {phase === 'ready' &&
          filtered.map((booking) => (
            <BookingListRow key={booking.id} booking={booking} onPress={() => router.push(`/(tabs)/bookings/${booking.id}`)} />
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 21,
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  chipText: {
    color: colors.tx70,
    fontFamily: fonts.subSemiBold,
    fontSize: 11,
  },
  chipTextActive: {
    color: colors.off,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
