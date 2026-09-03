import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { formatCentsAsBRL, formatDatePt } from '@/lib/format';
import { STATUS_LABELS, type BookingWithOtherParty } from '@/lib/data/bookings';

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  proposta_enviada: { bg: 'rgba(245,166,35,.18)', fg: colors.amber },
  aceita: { bg: 'rgba(62,207,110,.18)', fg: colors.green },
  aguardando_pagamento: { bg: 'rgba(245,166,35,.18)', fg: colors.amber },
  concluida: { bg: 'rgba(251,249,242,.12)', fg: colors.off },
  recusada: { bg: 'rgba(251,249,242,.08)', fg: colors.tx50 },
  cancelada: { bg: 'rgba(226,41,28,.18)', fg: '#ff8b80' },
};

export function BookingListRow({ booking, onPress }: { booking: BookingWithOtherParty; onPress: () => void }) {
  const tone = STATUS_TONE[booking.status];

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {booking.description || booking.otherPartyName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            booking.event_date ? formatDatePt(booking.event_date) : null,
            booking.event_location,
            booking.cache_amount_cents != null ? formatCentsAsBRL(booking.cache_amount_cents) : null,
          ]
            .filter(Boolean)
            .join(' · ') || booking.otherPartyName}
        </Text>
      </View>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pillText, { color: tone.fg }]}>{STATUS_LABELS[booking.status]}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 8,
  },
  main: {
    flex: 1,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
    marginBottom: 3,
  },
  meta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pillText: {
    fontFamily: fonts.subBold,
    fontSize: 9.5,
  },
});
