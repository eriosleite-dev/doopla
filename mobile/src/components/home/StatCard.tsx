import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

export type StatTone = 'red' | 'amber' | 'green' | 'off';

const TONE_BG: Record<StatTone, string> = {
  red: 'rgba(226,41,28,.15)',
  amber: 'rgba(245,166,35,.15)',
  green: 'rgba(62,207,110,.15)',
  off: 'rgba(251,249,242,.1)',
};

export function StatCard({ icon, tone, num, label }: { icon: ReactNode; tone: StatTone; num: string; label: string }) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: TONE_BG[tone] }]}>{icon}</View>
      <View>
        <Text style={styles.num}>{num}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 172,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    color: colors.off,
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 19,
  },
  label: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10,
    marginTop: 2,
  },
});
