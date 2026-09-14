import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { formatCentsAsBRL } from '@/lib/format';

// Ganhos só aparecem quando existir indicação QUALIFICADA de verdade
// (rows com status='qualificada' em referrals) — "assinantes ativos"
// nunca existiu como métrica real no backend, removido de propósito
// (não é um "ainda não implementado na UI", é um número que não deve
// ser inventado). pendingCount é real (indicações aguardando
// qualificação), mostrado só como contexto, nunca como ganho.
export function IndiqueGanheCard({
  earnedCents,
  pendingCount,
  onVerGanhos,
}: {
  earnedCents: number | null;
  pendingCount: number;
  onVerGanhos: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Indique e ganhe</Text>
      <View style={styles.glow}>
        <Text style={styles.glowText}>$</Text>
      </View>
      {earnedCents != null && earnedCents > 0 ? (
        <>
          <Text style={styles.earned}>{formatCentsAsBRL(earnedCents)}</Text>
          <Text style={styles.earnedLabel}>
            {pendingCount > 0 ? `${pendingCount} indicações pendentes` : 'Ganhos já qualificados'}
          </Text>
        </>
      ) : (
        <Text style={styles.earnedLabel}>Seus ganhos aparecerão aqui quando suas indicações forem qualificadas.</Text>
      )}
      <Pressable style={styles.btn} onPress={onVerGanhos}>
        <Text style={styles.btnText}>Ver meus ganhos →</Text>
      </Pressable>
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
  glow: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.green,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  glowText: {
    color: colors.black,
    fontFamily: fonts.display,
    fontSize: 17,
  },
  earned: {
    color: colors.green,
    fontFamily: fonts.display,
    fontSize: 19,
    textAlign: 'center',
  },
  earnedLabel: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 10,
  },
  btn: {
    backgroundColor: colors.green,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnText: {
    color: colors.black,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
});
