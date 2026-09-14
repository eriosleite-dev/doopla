import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { buildCalendarMonth } from '@/lib/data/agenda';

const WEEKDAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function MonthCalendar({
  year,
  month,
  selectedDate,
  datesWithActivity,
  onSelectDate,
}: {
  year: number;
  month: number;
  selectedDate: string;
  datesWithActivity: Set<string>;
  onSelectDate: (date: string) => void;
}) {
  const weeks = buildCalendarMonth(year, month);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} style={styles.week}>
          {week.map((day) => {
            const selected = day.date === selectedDate;
            const isToday = day.date === today;
            return (
              <Pressable
                key={day.date}
                onPress={() => onSelectDate(day.date)}
                style={[styles.day, selected && styles.daySelected]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !day.inMonth && styles.dayTextMuted,
                    selected && styles.dayTextSelected,
                    isToday && !selected && styles.dayTextToday,
                  ]}
                >
                  {day.day}
                </Text>
                {datesWithActivity.has(day.date) && <View style={[styles.marker, selected && styles.markerSelected]} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    width: CELL,
    textAlign: 'center',
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9.5,
  },
  week: {
    flexDirection: 'row',
  },
  day: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL / 2,
  },
  daySelected: {
    backgroundColor: colors.red,
  },
  dayText: {
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
  },
  dayTextMuted: {
    color: colors.tx30,
  },
  dayTextSelected: {
    color: colors.off,
    fontFamily: fonts.subBold,
  },
  dayTextToday: {
    color: colors.red,
    fontFamily: fonts.subBold,
  },
  marker: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.red,
  },
  markerSelected: {
    backgroundColor: colors.off,
  },
});
