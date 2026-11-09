import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { StatusPill, type StatusPillTone } from '@/components/shared/StatusPill';

export function BookingRow({
  month,
  day,
  name,
  place,
  statusLabel,
  statusTone,
  bordered,
}: {
  month: string;
  day: string;
  name: string;
  place: string;
  statusLabel: string;
  statusTone: StatusPillTone;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.row, bordered && styles.bordered]}>
      <View style={styles.date}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.place}>{place}</Text>
      </View>
      <StatusPill label={statusLabel} tone={statusTone} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  date: {
    width: 30,
    alignItems: 'center',
  },
  dateMonth: {
    color: colors.tx50,
    fontFamily: fonts.mono,
    fontSize: 9.5,
  },
  dateDay: {
    color: colors.off,
    fontFamily: fonts.display,
    fontSize: 14,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
  place: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10,
  },
});
