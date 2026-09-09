import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { formatCentsAsBRL, formatDatePt } from '@/lib/format';
import { bookingStatusTone, STATUS_LABELS, type BookingWithOtherParty } from '@/lib/data/bookings';
import { StatusPill } from '@/components/shared/StatusPill';

// Tom do pill vem de bookingStatusTone (correção 09/09/2026, D1/D2) —
// mesma regra do painel web, nunca um mapa local divergente por tela.
export function BookingListRow({
  booking,
  viewerId,
  onPress,
}: {
  booking: BookingWithOtherParty;
  viewerId: string;
  onPress: () => void;
}) {
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
      <StatusPill label={STATUS_LABELS[booking.status]} tone={bookingStatusTone(booking, viewerId)} />
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
});
