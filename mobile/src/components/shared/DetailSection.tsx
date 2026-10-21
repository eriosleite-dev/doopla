import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

// Bloco de detalhe padrão (Bookings/Agenda/etc). Quem chama decide
// se renderiza ou não — blocos sem dado útil simplesmente não são
// montados pelo caller, nunca mostramos aqui um placeholder tipo
// "Não informado".
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
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
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  label: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  value: {
    color: colors.off,
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    flexShrink: 1,
    textAlign: 'right',
  },
});
