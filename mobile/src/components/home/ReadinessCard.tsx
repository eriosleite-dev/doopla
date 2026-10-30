import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

export type ReadinessRowData = {
  key: string;
  label: string;
  description: string;
  ctaLabel: string;
  onPress: () => void;
};

// Bloco 4 — nudge progressivo de prontidão (08/09/2026). Espelha
// ChannelsCard (mesmo card/row/bordered) — nunca um banner novo.
// Progressivo e nunca bloqueante: cada pendência é sua própria linha,
// some sozinha quando resolvida; o card inteiro não renderiza nada
// quando `rows` chega vazio (chamador decide o que entra — ver
// (tabs)/index.tsx).
export function ReadinessCard({ rows }: { rows: ReadinessRowData[] }): ReactNode {
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Deixe sua Doopla pronta</Text>
      {rows.map((row, i) => (
        <View key={row.key} style={[styles.row, i > 0 && styles.bordered]}>
          <View style={styles.textWrap}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.description}>{row.description}</Text>
          </View>
          <Pressable onPress={row.onPress} hitSlop={6}>
            <Text style={styles.cta}>{row.ctaLabel}</Text>
          </Pressable>
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
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 9.5,
  },
  description: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 2,
  },
  cta: {
    flexShrink: 0,
    color: colors.red,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
});
