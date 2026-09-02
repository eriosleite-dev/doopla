import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

export function DealCard({
  icon,
  name,
  meta,
  note,
  when,
  onDetalhes,
  onDecidir,
}: {
  icon: ReactNode;
  name: string;
  meta: string;
  note: string;
  when: string;
  onDetalhes: () => void;
  onDecidir: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>{icon}</View>
        <View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </View>
      <Text style={styles.note}>{note}</Text>
      <Text style={styles.when}>{when}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.btnOutline} onPress={onDetalhes}>
          <Text style={styles.btnOutlineText}>Detalhes</Text>
        </Pressable>
        <Pressable style={styles.btnSolid} onPress={onDecidir}>
          <Text style={styles.btnSolidText}>Decidir</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,.035)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 14,
    marginTop: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(226,41,28,.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13.5,
  },
  meta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
  note: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  when: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 7,
  },
  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  btnOutlineText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
  btnSolid: {
    flex: 1,
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  btnSolidText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 11.5,
  },
});
