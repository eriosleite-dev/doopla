import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export type StatusPillTone = 'red' | 'amber' | 'green';

const TONE_STYLES: Record<StatusPillTone, { bg: string; fg: string }> = {
  red: { bg: 'rgba(226,41,28,.18)', fg: '#ff8b80' },
  amber: { bg: 'rgba(245,166,35,.18)', fg: colors.amber },
  green: { bg: 'rgba(62,207,110,.18)', fg: colors.green },
};

export function StatusPill({ label, tone }: { label: string; tone: StatusPillTone }) {
  const t = TONE_STYLES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontFamily: fonts.subBold,
    fontSize: 9.5,
  },
});
