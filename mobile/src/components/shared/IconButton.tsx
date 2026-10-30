import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type Badge = { kind: 'count'; value: number } | { kind: 'dot' } | undefined;

export function IconButton({ children, badge, onPress }: { children: ReactNode; badge?: Badge; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.btn} hitSlop={6}>
      {children}
      {badge?.kind === 'count' && (
        <View style={styles.badgeCount}>
          <Text style={styles.badgeCountText}>{badge.value}</Text>
        </View>
      )}
      {badge?.kind === 'dot' && <View style={styles.badgeDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCount: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: colors.red,
    borderRadius: 8,
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCountText: {
    color: colors.off,
    fontFamily: fonts.mono,
    fontSize: 8.5,
  },
  badgeDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
});
