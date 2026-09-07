import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { MascotBall } from '@/components/shared/MascotBall';

export function HomeHero({
  firstName,
  needsYouCount = 0,
  hasDooplaPro,
}: {
  firstName: string;
  needsYouCount?: number;
  // Só informativo — status da conta, nunca CTA de upgrade. Mesma
  // fonte canônica do Web (hasDooplaPro(), migration 0074).
  hasDooplaPro: boolean;
}) {
  return (
    <View style={styles.hero}>
      <View style={[styles.badge, hasDooplaPro ? styles.badgePro : styles.badgeBasico]}>
        <Text style={[styles.badgeText, hasDooplaPro ? styles.badgeTextPro : styles.badgeTextBasico]}>
          {hasDooplaPro ? 'PRO' : 'BÁSICO'}
        </Text>
      </View>
      <Text style={styles.h1}>
        Oi, {firstName}
        <View style={styles.dot} />
      </Text>
      <Text style={styles.p}>Sua Doopla negocia, organiza e cuida dos seus bookings.</Text>
      <View style={styles.statusRow}>
        <View style={styles.pulse} />
        <Text style={styles.statusText}>
          {needsYouCount > 0
            ? `Ativa, com ${needsYouCount} conversa${needsYouCount > 1 ? 's' : ''} esperando por você`
            : 'Ativa, trabalhando por você'}
        </Text>
      </View>
      <View style={styles.mascotRow}>
        <MascotBall size={120} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 20,
    paddingTop: 22,
    marginBottom: 14,
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 8,
  },
  badgePro: {
    borderColor: colors.red,
  },
  badgeBasico: {
    borderColor: colors.line,
  },
  badgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  badgeTextPro: {
    color: colors.red,
  },
  badgeTextBasico: {
    color: colors.tx50,
  },
  h1: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 22,
    marginBottom: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.red,
    marginLeft: 4,
  },
  p: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18.5,
    marginBottom: 16,
    maxWidth: '80%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 18,
  },
  pulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.green,
  },
  statusText: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 11.5,
  },
  mascotRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
