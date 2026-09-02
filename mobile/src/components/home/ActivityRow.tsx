import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export function ActivityRow({
  icon,
  text,
  boldPart,
  sub,
  time,
  bordered,
}: {
  icon: ReactNode;
  text: string;
  boldPart: string;
  sub: string;
  time: string;
  bordered?: boolean;
}) {
  return (
    <View style={[styles.row, bordered && styles.bordered]}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.content}>
        <Text style={styles.text}>
          {text} <Text style={styles.bold}>{boldPart}</Text>
        </Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    alignItems: 'flex-start',
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  text: {
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 17,
  },
  bold: {
    fontFamily: fonts.bodySemiBold,
  },
  sub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 9.5,
  },
});
