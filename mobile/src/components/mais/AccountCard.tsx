import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

export function AccountCard({ initials, name, sub, planBadge }: { initials: string; name: string; sub: string; planBadge: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{planBadge}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 11,
    marginBottom: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12,
  },
  name: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
  sub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
  badge: {
    borderWidth: 1,
    borderColor: 'rgba(226,41,28,.4)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.red,
    fontFamily: fonts.mono,
    fontSize: 9,
  },
});
