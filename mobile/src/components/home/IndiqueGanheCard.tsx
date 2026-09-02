import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

// Ganhos e assinantes ativos só devem aparecer quando existir
// histórico real — nesta fase (dados mockados) sempre mostramos o
// exemplo do protótipo, mas o componente já aceita null pra cobrir o
// estado "sem histórico ainda" (empty state) no futuro.
export function IndiqueGanheCard({
  earned,
  activeSubscribers,
  onVerGanhos,
}: {
  earned: string | null;
  activeSubscribers: number | null;
  onVerGanhos: () => void;
}) {
  const hasHistory = earned !== null && activeSubscribers !== null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Indique e ganhe</Text>
      <View style={styles.glow}>
        <Text style={styles.glowText}>$</Text>
      </View>
      {hasHistory ? (
        <>
          <Text style={styles.earned}>{earned}</Text>
          <Text style={styles.earnedLabel}>{activeSubscribers} assinantes ativos</Text>
        </>
      ) : (
        <Text style={styles.earnedLabel}>Ainda sem histórico de indicações</Text>
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
