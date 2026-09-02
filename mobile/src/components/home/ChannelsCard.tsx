import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

export type ChannelRowData = {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  onCopy?: () => void;
};

// "Seus canais de booking": link, WhatsApp da Doopla e código ID —
// os que têm ação de copiar mostram o botão ⧉, mesmo comportamento
// do protótipo (rrow-copy).
export function ChannelsCard({ title, rows }: { title: string; rows: ChannelRowData[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {rows.map((row, i) => (
        <View key={row.key} style={[styles.row, i > 0 && styles.bordered]}>
          <View style={styles.iconWrap}>{row.icon}</View>
          <View style={styles.textWrap}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
          {row.onCopy && (
            <Pressable style={styles.copyBtn} onPress={row.onCopy} hitSlop={6}>
              <Text style={styles.copyIcon}>⧉</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  label: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 9.5,
  },
  value: {
    color: colors.off,
    fontFamily: fonts.mono,
    fontSize: 11.5,
  },
  copyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIcon: {
    color: colors.tx70,
    fontSize: 10,
  },
});
